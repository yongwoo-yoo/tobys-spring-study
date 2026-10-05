# 심화 2. JDBC·템플릿·예외·테스트를 한 흐름으로 이해하기

토비의 스프링은 단순히 `JdbcTemplate` 사용법을 가르치지 않는다. 반복되는 JDBC 코드를 직접 다듬으면서 **분리 가능한 책임을 발견하고, 안전한 공통 흐름을 재사용하는 법**을 보여준다.

참고: [Spring 공식 문서—JdbcTemplate과 오류 처리](https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html), [Spring 공식 문서—TestContext Framework](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework.html)

---

## 1. 관계형 DB에서 Java 객체까지

다음 테이블이 있다고 하자.

```sql
create table users (
    id varchar(50) primary key,
    name varchar(100) not null,
    email varchar(200) not null
);
```

관계형 DB의 한 행과 Java 객체는 표현 방식이 다르다.

```java
public record User(String id, String name, String email) { }
```

DAO는 두 세계의 변환 경계를 담당한다.

```text
Java User
   ↓ 파라미터 바인딩
SQL INSERT/UPDATE
   ↓ DB 실행
테이블 행

테이블 행
   ↓ ResultSet 읽기
Java User
```

## 2. JDBC 구성요소를 정확히 구분하기

### Driver

특정 DB와 통신하는 구현이다. JDBC 표준 인터페이스 뒤에서 MySQL, PostgreSQL 같은 벤더 드라이버가 실제 프로토콜을 처리한다.

### DataSource

`Connection`을 제공하는 표준 인터페이스다. 단순히 새 연결을 만들 수도 있고, 커넥션 풀에서 빌려줄 수도 있으며, 애플리케이션 서버의 JNDI 자원을 사용할 수도 있다.

### Connection

DB 세션과 트랜잭션 경계를 다루는 연결 객체다. `autoCommit`, `commit`, `rollback` 같은 동작을 제공한다.

### PreparedStatement

SQL과 파라미터를 분리한다.

```java
PreparedStatement ps = connection.prepareStatement(
    "select id, name, email from users where id = ?"
);
ps.setString(1, id);
```

문자열 연결로 SQL을 만들지 않고 파라미터 바인딩을 사용하면 값 인코딩과 SQL injection 문제를 줄인다.

### ResultSet

조회 결과를 행 단위로 탐색한다. 커서는 처음에 첫 행 이전에 있으므로 `next()`를 호출해야 한다.

## 3. 직접 작성한 JDBC DAO

```java
public User findById(String id) throws SQLException {
    Connection connection = null;
    PreparedStatement statement = null;
    ResultSet resultSet = null;

    try {
        connection = dataSource.getConnection();
        statement = connection.prepareStatement(
            "select id, name, email from users where id = ?"
        );
        statement.setString(1, id);
        resultSet = statement.executeQuery();

        if (!resultSet.next()) {
            throw new UserNotFoundException(id);
        }

        return new User(
            resultSet.getString("id"),
            resultSet.getString("name"),
            resultSet.getString("email")
        );
    } finally {
        if (resultSet != null) resultSet.close();
        if (statement != null) statement.close();
        if (connection != null) connection.close();
    }
}
```

코드의 대부분은 사용자 조회 규칙이 아니다. 자원 획득·정리와 JDBC 절차다. 모든 DAO 메서드에서 이를 복사하면 한 곳의 실수가 연결 누수로 이어진다.

현대 Java의 try-with-resources는 정리를 안전하게 단순화한다.

```java
try (Connection connection = dataSource.getConnection();
     PreparedStatement statement = connection.prepareStatement(sql)) {
    // 실행
}
```

하지만 SQL 실행 흐름과 예외 변환의 반복까지 모두 제거하지는 않는다. 토비의 템플릿/콜백 논의는 여전히 유효하다.

## 4. 리소스 누수가 서버 장애로 이어지는 과정

커넥션 풀에 10개의 연결이 있다고 하자.

```text
요청 1: 연결 대여 → 예외 → 반환 누락
요청 2: 연결 대여 → 예외 → 반환 누락
...
요청 10: 마지막 연결 누락
요청 11: 사용 가능한 연결을 기다리다 타임아웃
```

그래서 자원 반환은 각 개발자의 기억에 맡길 부가 작업이 아니라, 공통 템플릿이 반드시 보장해야 할 정책이다.

## 5. 메서드 추출만으로 충분하지 않은 이유

```java
private void executeDeleteAll() {
    // delete SQL과 JDBC 흐름 모두 존재
}
```

코드 길이는 줄어도 다른 SQL에 같은 흐름을 재사용하기 어렵다. 재사용하려면 고정 흐름과 변경 지점을 분리해야 한다.

```text
고정: 연결 획득 → Statement 생성 → 실행 → 예외 처리 → 자원 반환
변경: 어떤 Statement를 만들지, 파라미터는 무엇인지, 결과를 어떻게 변환할지
```

## 6. 전략 패턴으로 변경 지점 전달하기

```java
@FunctionalInterface
interface StatementCreator {
    PreparedStatement create(Connection connection) throws SQLException;
}

public int executeUpdate(StatementCreator creator) throws SQLException {
    try (Connection connection = dataSource.getConnection();
         PreparedStatement statement = creator.create(connection)) {
        return statement.executeUpdate();
    }
}
```

호출자는 SQL이라는 변하는 전략만 전달한다.

```java
public int deleteAll() throws SQLException {
    return executeUpdate(connection ->
        connection.prepareStatement("delete from users")
    );
}
```

`executeUpdate`는 템플릿이고 람다는 콜백이다. 템플릿이 콜백을 호출하기 때문에 callback이라는 이름이 붙는다.

## 7. 조회용 콜백까지 확장하기

```java
@FunctionalInterface
interface ResultMapper<T> {
    T map(ResultSet resultSet) throws SQLException;
}

public <T> T queryOne(
        StatementCreator creator,
        ResultMapper<T> mapper) throws SQLException {
    try (Connection connection = dataSource.getConnection();
         PreparedStatement statement = creator.create(connection);
         ResultSet resultSet = statement.executeQuery()) {

        if (!resultSet.next()) {
            throw new EmptyResultException();
        }
        return mapper.map(resultSet);
    }
}
```

제네릭 `<T>` 덕분에 User뿐 아니라 Order, 단일 숫자 등 다양한 결과 타입을 반환할 수 있다.

## 8. JdbcTemplate가 담당하는 것

공식 문서에 따르면 `JdbcTemplate`은 다음을 담당한다.

- 자원 생성과 반환
- Statement 생성과 실행의 기본 흐름
- ResultSet 반복
- JDBC 예외 포착과 `DataAccessException` 계층으로 변환

개발자가 제공하는 것은 다음이다.

- SQL
- 파라미터
- 한 행을 객체로 바꾸는 `RowMapper`
- 필요한 결과의 형태

```java
public final class JdbcUserRepository implements UserRepository {
    private final JdbcTemplate jdbcTemplate;

    public JdbcUserRepository(DataSource dataSource) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    public User findById(String id) {
        String sql = """
            select id, name, email
            from users
            where id = ?
            """;

        return jdbcTemplate.queryForObject(
            sql,
            (rs, rowNum) -> new User(
                rs.getString("id"),
                rs.getString("name"),
                rs.getString("email")
            ),
            id
        );
    }

    public void save(User user) {
        jdbcTemplate.update(
            "insert into users(id, name, email) values (?, ?, ?)",
            user.id(), user.name(), user.email()
        );
    }
}
```

`JdbcTemplate`을 쓰는 목적은 SQL을 숨기는 것이 아니다. 반복되는 안전한 실행 흐름을 재사용하는 것이다.

## 9. 템플릿/콜백을 JDBC 밖에서 발견하기

파일의 모든 숫자를 더하는 예:

```java
interface LineCallback<T> {
    T apply(String line, T current);
}

public <T> T readLines(
        Path path,
        T initial,
        LineCallback<T> callback) throws IOException {
    T result = initial;
    try (BufferedReader reader = Files.newBufferedReader(path)) {
        String line;
        while ((line = reader.readLine()) != null) {
            result = callback.apply(line, result);
        }
    }
    return result;
}
```

```java
int sum = readLines(path, 0,
    (line, current) -> current + Integer.parseInt(line));
```

고정된 파일 열기·읽기·닫기 흐름과 변하는 줄 처리 로직이 분리된다. 패턴은 특정 API 이름이 아니라 문제 구조로 알아봐야 한다.

## 10. Java 예외 체계

```text
Throwable
 ├─ Error
 └─ Exception
     ├─ RuntimeException
     └─ 그 밖의 체크 예외
```

### Error

JVM 수준의 심각한 문제를 나타내는 경우가 많다. 일반 애플리케이션이 잡아서 업무 흐름으로 복구할 대상으로 보지 않는다.

### 체크 예외

메서드가 잡거나 `throws`로 선언해야 한다. 복구 가능한 상황을 호출자에게 강제로 인식시키는 장점이 있지만, 모든 계층이 기계적으로 전달하면 코드가 기술 예외에 오염될 수 있다.

### 언체크 예외

`RuntimeException` 계열이다. 처리 선언을 강제하지 않는다. 강제하지 않는다는 것이 무시해도 된다는 뜻은 아니다.

## 11. 예외 블랙홀이 만드는 실제 오류

```java
public void register(User user) {
    try {
        repository.save(user);
    } catch (SQLException e) {
        log.error("저장 실패", e);
    }
    messageSender.sendWelcome(user);
}
```

저장에 실패했는데 환영 메시지가 발송된다. 로그가 있어도 호출 흐름은 성공으로 인식한다. 오류 처리는 “로그를 남겼는가?”보다 “실패 후 프로그램 상태와 호출자에게 어떤 의미를 전달했는가?”로 판단한다.

## 12. 예외 복구·회피·전환

### 복구

```java
for (int attempt = 1; attempt <= 3; attempt++) {
    try {
        return remoteClient.call();
    } catch (TemporaryNetworkException e) {
        if (attempt == 3) throw e;
        backoff(attempt);
    }
}
```

일시 오류인지, 재시도가 안전한 작업인지, 최대 횟수와 간격은 어떤지 판단해야 한다.

### 회피

```java
public void save(User user) throws SQLException {
    delegate.save(user);
}
```

현재 계층보다 호출자가 더 적절하게 처리할 수 있을 때 넘긴다.

### 전환

```java
try {
    jdbcTemplate.update(/* ... */);
} catch (DuplicateKeyException e) {
    throw new DuplicateUserException(user.id(), e);
}
```

저수준 기술 오류를 현재 계층의 의미로 바꾸되 원인 예외를 보존한다.

## 13. Spring 데이터 접근 예외 추상화

DB마다 오류 코드와 예외 표현이 다르다. Spring은 `SQLExceptionTranslator`를 통해 `SQLException`을 데이터 접근 기술에 독립적인 `DataAccessException` 계층으로 변환한다.

```text
MySQL 중복 키 SQLException ─┐
PostgreSQL 중복 키 SQLException ─┼→ DuplicateKeyException
다른 접근 기술의 중복 오류 ────┘
```

상위 계층은 벤더 코드를 비교하는 대신 의미 있는 예외 타입을 다룰 수 있다. 이것은 PSA의 한 예다.

## 14. 테스트가 필요한 이유를 정확히 정의하기

테스트는 단지 버그를 찾는 코드가 아니다.

- 현재 동작을 실행 가능한 예제로 기록한다.
- 변경 후 기존 규칙이 유지되는지 확인한다.
- 설계가 사용하기 어려운지 빠르게 드러낸다.
- 큰 문제를 작은 실패로 좁힌다.
- 리팩터링할 수 있는 자신감을 준다.

## 15. JUnit 테스트의 구조

```java
class RegistrationServiceTest {
    private MemoryUserRepository repository;
    private RecordingMessageSender sender;
    private RegistrationService service;

    @BeforeEach
    void setUp() {
        repository = new MemoryUserRepository();
        sender = new RecordingMessageSender();
        service = new RegistrationService(repository, sender);
    }

    @Test
    void 신규_회원을_등록한다() {
        service.register("alice", "alice@example.com");

        assertTrue(repository.existsById("alice"));
        assertEquals("alice", sender.sentTo.id());
    }

    @Test
    void 중복_아이디는_거부한다() {
        service.register("alice", "a@example.com");

        assertThrows(DuplicateUserException.class,
            () -> service.register("alice", "b@example.com"));
    }
}
```

테스트 이름은 구현 메서드보다 동작과 조건을 표현한다.

## 16. AAA와 Given–When–Then

두 표현은 같은 사고를 돕는다.

```text
Arrange / Given: 테스트 상태와 협력 객체 준비
Act / When: 검증할 행동 실행
Assert / Then: 관찰 가능한 결과 확인
```

준비 코드가 너무 길면 픽스처 빌더나 헬퍼를 사용한다. 단, 테스트에서 중요한 차이가 헬퍼 안에 숨지 않도록 한다.

## 17. 경계값을 찾는 방법

“가입 횟수가 30회 이상이면 GOLD 승급” 규칙이라면 다음을 검사한다.

- 29회: 승급하지 않음
- 30회: 승급함
- 31회: 승급함

동등분할은 같은 방식으로 처리될 입력을 그룹으로 묶고, 경계값 분석은 분기점의 바로 아래·같은 값·바로 위를 검사한다.

## 18. 테스트 더블 구분

### Fake

실제로 동작하지만 단순화한 구현. `MemoryUserRepository`가 예다.

### Stub

준비된 답을 반환한다.

```java
when(repository.existsById("alice")).thenReturn(true);
```

### Mock

상호작용을 기록하고 검증한다.

```java
verify(messageSender).sendWelcome(user);
```

### Spy

실제 객체 동작을 유지하면서 일부 호출을 관찰하거나 변경한다. 실제 내부 구현과 결합하기 쉬워 신중히 사용한다.

## 19. 상태 검증과 행위 검증

- 상태 검증: 저장된 사용자, 계산 결과처럼 최종 상태를 검사
- 행위 검증: 결제 API가 정확히 한 번 호출됐는지 같은 협력을 검사

관찰 가능한 결과를 상태로 확인할 수 있다면 상태 검증이 리팩터링에 더 안정적인 경우가 많다. 외부 시스템 호출처럼 상호작용 자체가 요구사항이면 행위 검증이 적절하다.

## 20. 단위·통합·인수 테스트

| 종류 | 주요 목적 | 특징 |
|---|---|---|
| 단위 테스트 | 한 객체의 규칙과 분기 | 빠름, 가짜 협력 객체 사용 가능 |
| 통합 테스트 | DB 매핑, 빈 구성, 트랜잭션 등 연결 | 실제 구성요소 일부 사용 |
| 인수/종단 테스트 | 사용자 관점의 전체 시나리오 | 느리지만 전체 경로 확인 |

모든 테스트를 컨테이너 통합 테스트로 만들면 느리고 실패 원인이 넓어진다. 모든 것을 Mock 단위 테스트로 만들면 실제 SQL과 설정 오류를 놓친다. 위험에 맞게 층을 조합한다.

## 21. Spring TestContext 내부 흐름

공식 문서의 핵심 추상화는 다음과 같다.

- `TestContext`: 현재 테스트의 컨텍스트와 캐싱 정보
- `TestContextManager`: 테스트 생명주기 이벤트를 리스너에게 전달
- `TestExecutionListener`: 의존성 주입, 트랜잭션, SQL 실행 등의 기능 참여
- `ContextLoader`: 설정으로부터 `ApplicationContext` 로딩

```text
테스트 클래스 준비
 → 설정 메타정보 확인
 → 캐시 키 계산
 → 캐시에 있으면 ApplicationContext 재사용
 → 없으면 생성 후 캐시
 → 테스트 인스턴스에 빈 주입
 → before/test/after 시점마다 리스너 실행
```

## 22. 컨텍스트 캐시가 중요한 이유

컨테이너 자체보다 컨테이너가 만드는 객체—DB 풀, ORM 메타데이터, 외부 클라이언트—초기화가 오래 걸릴 수 있다. 같은 설정의 테스트들이 컨텍스트를 재사용하면 전체 실행 시간이 크게 줄어든다.

캐시 키에 영향을 주는 설정이 테스트마다 달라지면 별도 컨텍스트가 만들어진다. 무분별한 프로파일, 동적 프로퍼티, 서로 다른 Mock 빈 구성이 테스트 속도를 떨어뜨릴 수 있다.

## 23. `@DirtiesContext`를 언제 쓰는가

테스트가 컨텍스트나 singleton 빈을 다른 테스트에서 재사용할 수 없을 정도로 바꿨을 때 캐시에서 제거한다.

먼저 확인할 대안:

- singleton 빈에서 변경 상태 제거
- DB 데이터는 테스트 트랜잭션으로 롤백
- 테스트 전후 명시적 초기화
- 변경 가능한 객체를 테스트마다 새로 생성

원인을 고치지 않고 모든 테스트에 붙이면 컨텍스트가 계속 재생성되어 느려진다.

## 24. 테스트 실패를 읽는 순서

1. 가장 처음 발생한 실패와 원인 예외를 본다.
2. 기대값과 실제값의 의미를 비교한다.
3. 테스트 자체가 외부 상태나 순서에 의존하는지 확인한다.
4. 구현 오류인지 설정/통합 오류인지 범위를 좁힌다.
5. 실패를 재현하는 가장 작은 테스트를 만든다.

## 25. 장 마무리 실습

다음을 순서대로 구현한다.

1. 순수 JDBC로 `save`, `findById`, `deleteAll`, `count` 작성
2. 예외가 발생해도 자원이 반환되는 테스트 또는 관찰 작성
3. 공통 실행 흐름을 템플릿으로 추출
4. `JdbcTemplate` 버전으로 바꾸고 코드 책임 비교
5. 중복 키 오류를 애플리케이션 예외로 변환
6. 메모리 저장소 단위 테스트와 실제 DB 통합 테스트 분리

### 스스로 답할 질문

1. `DataSource`와 `Connection`은 어떻게 다른가?
2. 템플릿/콜백이 단순 중복 제거 이상의 의미를 갖는 이유는?
3. `JdbcTemplate`이 해주지 않는 애플리케이션 책임은 무엇인가?
4. 체크 예외를 런타임 예외로 바꾼다고 예외가 사라지는 것은 아닌 이유는?
5. 단위 테스트와 DB 통합 테스트를 둘 다 가져야 하는 이유는?
