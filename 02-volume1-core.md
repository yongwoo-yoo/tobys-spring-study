# 1권 핵심 해설: 문제를 해결하며 스프링에 도착하기

이 문서는 GitBook의 1~6장과 8장을 초심자의 눈높이로 다시 연결한다. 세부 API보다 각 단계에서 **왜 기존 코드가 불편했고, 어떤 책임을 어디로 옮겼는지**에 집중한다.

---

# 1장. 오브젝트와 의존관계

## 이 장의 질문

> `UserDao`가 DB 연결 객체를 직접 만들면 왜 문제가 되고, 스프링은 무엇을 대신하는가?

## 1단계: 모든 것을 아는 DAO

초기 `UserDao`는 SQL 처리뿐 아니라 MySQL 드라이버와 접속 주소까지 안다.

```java
class UserDao {
    public void add(User user) throws SQLException {
        Connection connection = DriverManager.getConnection(
            "jdbc:mysql://localhost/app", "user", "password"
        );
        // SQL 생성, 실행, 자원 정리...
    }
}
```

DB 접속 방식과 사용자 저장 로직은 서로 다른 이유로 변한다. 둘을 한곳에 두면 DB가 바뀔 때 검증된 SQL 코드까지 수정해야 한다.

## 2단계: 바뀌는 것을 인터페이스 뒤로

```java
interface ConnectionMaker {
    Connection makeConnection() throws SQLException;
}

class UserDao {
    private final ConnectionMaker connectionMaker;

    UserDao(ConnectionMaker connectionMaker) {
        this.connectionMaker = connectionMaker;
    }
}
```

이제 `UserDao`는 연결이 *어떻게* 만들어지는지 모른다. 단지 `ConnectionMaker`의 약속을 사용한다. 그러나 누군가는 실제 구현체를 만들고 연결해야 한다.

## 3단계: 생성과 조립은 팩토리로

```java
class DaoFactory {
    UserDao userDao() {
        return new UserDao(connectionMaker());
    }

    ConnectionMaker connectionMaker() {
        return new MySqlConnectionMaker();
    }
}
```

`UserDao`는 사용 책임, `DaoFactory`는 구성 책임을 가진다. 애플리케이션의 객체가 자신이 사용할 구현을 직접 선택하던 **제어권이 외부로 이동**했다. 이것이 IoC(Inversion of Control, 제어의 역전)의 핵심 감각이다.

## 4단계: 범용 팩토리인 스프링 컨테이너

```java
@Configuration
class AppConfig {
    @Bean
    UserDao userDao() {
        return new UserDao(connectionMaker());
    }

    @Bean
    ConnectionMaker connectionMaker() {
        return new MySqlConnectionMaker();
    }
}
```

- Bean: 스프링 컨테이너가 관리하는 객체
- BeanFactory: 빈 생성·조회·연결을 담당하는 최소 컨테이너
- ApplicationContext: BeanFactory 기능과 이벤트, 리소스, 메시지 등 애플리케이션 서비스를 함께 제공하는 컨테이너
- 설정 메타정보: 어떤 객체를 만들고 어떻게 연결할지 적은 정보

GitHub 보충 자료는 컨테이너 구현을 `GenericApplicationContext`, `GenericXmlApplicationContext`, `WebApplicationContext` 등으로 더 세분한다. 초심자는 먼저 “설정 형식이나 실행 환경이 달라도, 컨테이너는 메타정보를 읽어 빈을 만들고 연결한다”만 잡으면 된다.

## IoC와 DI의 차이

- IoC: 객체 생성·호출 등의 제어권이 프레임워크나 외부 구성 객체로 넘어가는 넓은 원리
- DI: 한 객체가 사용할 다른 객체를 외부에서 전달받는 구체적인 방법

생성자 주입의 예:

```java
class UserService {
    private final UserDao userDao;

    UserService(UserDao userDao) {
        this.userDao = userDao;
    }
}
```

생성자 주입은 객체가 완성되는 순간 필수 의존성이 갖춰지고, 필드를 `final`로 둘 수 있으며, 스프링 없이도 테스트하기 쉽다. 원문에는 setter나 일반 메서드 주입도 나오지만 필수 의존성에는 생성자 주입을 우선 이해하자.

## Dependency Lookup과 DI

```java
// DL: 필요한 객체가 컨테이너를 직접 조회
UserDao dao = context.getBean(UserDao.class);

// DI: 외부가 생성자 등을 통해 전달
new UserService(userDao);
```

DL을 비즈니스 객체 곳곳에서 사용하면 스프링 API에 의존하게 된다. 보통 시작 지점에서만 컨테이너를 조회하고 내부 객체들은 DI로 연결한다.

## 싱글톤과 스코프

기본적으로 스프링은 빈 하나를 만들어 컨테이너 안에서 공유한다. 전통적인 `Singleton` 패턴처럼 클래스가 private 생성자와 전역 접근자를 강제하지 않으므로 상속·테스트·교체가 더 쉽다.

주의: 공유되는 싱글톤 빈에 요청별 사용자 정보 같은 변경 가능한 상태를 필드로 저장하면 여러 스레드가 서로의 값을 덮어쓸 수 있다. 서비스 빈은 대개 상태 없이(stateless) 만든다.

- singleton: 컨테이너당 보통 한 인스턴스
- prototype: 요청할 때마다 새 인스턴스
- request/session: 웹 요청 또는 세션 수명에 맞춘 인스턴스

GitHub 자료는 `@ComponentScan`, `@Autowired`, `@Primary`, `@Qualifier`, 프로파일도 다룬다. 이것들은 **빈을 발견하고 후보를 결정하고 환경별 구성을 바꾸는 도구**이지 DI의 목적 그 자체가 아니다.

## 1장 인출

1. `UserDao`가 `new MySqlConnectionMaker()`를 직접 호출하면 어떤 변경이 전파되는가?
2. 팩토리를 분리한 순간 누구에게 제어권이 이동했는가?
3. IoC와 DI를 각각 한 문장으로 설명하라.
4. 스프링 싱글톤 빈에 변경 가능한 필드를 두면 왜 위험한가?

---

# 2장. 테스트

## 이 장의 질문

> 리팩터링을 계속하면서도 동작이 깨지지 않았다고 어떻게 확신하는가?

`main()`으로 DAO를 실행하고 콘솔 문구를 사람이 확인하는 방식에는 문제가 있다.

- 매번 사람이 결과를 읽어야 한다.
- 여러 테스트를 일괄 실행하기 어렵다.
- 이전 실행의 DB 데이터가 다음 실행 결과에 영향을 준다.
- 실패 원인이 명확히 보고되지 않는다.

JUnit 테스트는 검증을 코드로 만든다.

```java
@Test
void addAndGet() {
    dao.deleteAll();
    User user = new User("alice", "앨리스");

    dao.add(user);
    User found = dao.get("alice");

    assertEquals(user.getName(), found.getName());
}
```

## 좋은 테스트의 성질

- 자동으로 실행되고 결과를 스스로 판정한다.
- 다른 테스트와 실행 순서에 의존하지 않는다.
- 같은 조건에서는 같은 결과를 낸다.
- 작은 단위로 실패 원인을 좁힌다.
- 빠르게 반복할 수 있다.

`deleteAll()`처럼 시작 상태를 통제하면 테스트가 반복 가능해진다. 단, 운영 코드에 테스트 편의 메서드를 무조건 추가하라는 뜻은 아니다. 테스트 DB, 트랜잭션 롤백, 픽스처 생성기 등 상황에 맞는 격리 방식을 고른다.

## TDD의 짧은 순환

1. 실패하는 테스트를 먼저 쓴다(Red).
2. 통과시키는 최소 코드를 쓴다(Green).
3. 동작을 유지하며 구조를 개선한다(Refactor).

테스트를 먼저 쓰면 요구사항을 호출자의 관점에서 구체화하고, 필요 이상으로 구현하는 일을 줄인다.

## 스프링 테스트 컨텍스트

원문의 JUnit 4 표현은 다음과 같다.

```java
@RunWith(SpringJUnit4ClassRunner.class)
@ContextConfiguration(classes = AppConfig.class)
class UserDaoTest { }
```

현대 JUnit 5에서는 보통 SpringExtension을 사용하며, 관련 애노테이션에 포함되기도 한다. 핵심은 테스트가 스프링 컨테이너를 생성하고 빈을 주입받을 수 있다는 점이다.

`@DirtiesContext`는 테스트가 컨테이너의 상태를 변경해 재사용하면 안 된다고 표시한다. 편리하지만 컨텍스트를 다시 만들게 하므로 남용하면 테스트가 느려진다.

GitHub 보충 자료의 테스트 분류:

- `@SpringBootTest`: 전체 애플리케이션 컨텍스트에 가까운 통합 테스트
- `@WebMvcTest`: MVC 계층 일부만 로딩하는 슬라이스 테스트
- `@DataJpaTest`: JPA 관련 구성만 로딩하는 슬라이스 테스트
- 학습 테스트: 낯선 라이브러리의 동작을 직접 검증하며 학습
- 버그 테스트: 발견된 버그를 재현하는 실패 테스트를 먼저 고정

## 단위 테스트와 통합 테스트

둘 중 하나만 옳은 것이 아니다.

- 단위 테스트는 빠르고 실패 위치가 선명하다.
- 통합 테스트는 실제 설정과 구성 요소의 연결을 검증한다.

비즈니스 규칙은 고립된 단위 테스트로 촘촘히 확인하고, DB 매핑과 빈 연결은 필요한 범위에서 통합 테스트로 확인한다.

## 2장 인출

1. 테스트가 이전 실행의 DB 데이터에 의존하면 어떤 문제가 생기는가?
2. TDD의 Red–Green–Refactor를 설명하라.
3. 단위 테스트와 통합 테스트가 각각 잡기 좋은 오류는 무엇인가?
4. `@DirtiesContext`가 느린 이유는 무엇인가?

---

# 3장. 템플릿

## 이 장의 질문

> JDBC 메서드마다 반복되는 자원 획득·예외 처리·자원 반환을 어떻게 한곳에서 보장하는가?

JDBC 코드는 예외가 나도 `Connection`, `Statement`, `ResultSet`을 닫아야 한다. `finally`를 반복하면 길고 실수하기 쉽다.

```java
Connection c = null;
PreparedStatement ps = null;
try {
    c = dataSource.getConnection();
    ps = c.prepareStatement("delete from users");
    ps.executeUpdate();
} finally {
    if (ps != null) ps.close();
    if (c != null) c.close();
}
```

여기서 변하지 않는 흐름과 변하는 부분을 나눈다.

- 변하지 않음: 연결 획득, 문장 실행, 예외 처리, 자원 정리
- 변함: 실제 SQL과 파라미터 설정

```java
interface StatementStrategy {
    PreparedStatement make(Connection c) throws SQLException;
}

void jdbcContext(StatementStrategy strategy) throws SQLException {
    Connection c = dataSource.getConnection();
    PreparedStatement ps = null;
    try {
        ps = strategy.make(c);
        ps.executeUpdate();
    } finally {
        if (ps != null) ps.close();
        c.close();
    }
}
```

`jdbcContext`는 고정된 작업 흐름인 템플릿이고, `StatementStrategy` 구현은 호출 때 전달되는 콜백이다.

## 왜 단순 메서드 추출만으로 부족한가

메서드를 뽑아도 변하는 SQL이 공통 흐름 안에 있으면 재사용 범위가 좁다. 상속 기반 템플릿 메서드 패턴은 클래스마다 하위 클래스를 만들어야 하고 상속 결합이 생긴다. 전략과 콜백을 인자로 전달하면 구성으로 동작을 바꿀 수 있다.

## 로컬 클래스와 익명 내부 클래스

콜백이 한 메서드에서만 쓰인다면 가까운 위치에 두어 응집도를 높일 수 있다. 책은 Java 8 이전 스타일이라 익명 내부 클래스를 사용한다. 오늘날에는 람다로 표현할 수 있다.

```java
execute(connection -> connection.prepareStatement(
    "delete from users where id = ?"
));
```

## JdbcTemplate로 연결

스프링의 `JdbcTemplate`은 이 패턴을 이미 구현한다. GitHub 보충 자료에 따르면 다음을 대신한다.

- 연결 획득과 반환
- Statement 생성과 실행
- 반복 순회
- 예외 변환
- 자원 정리

개발자는 SQL, 파라미터, 행을 객체로 바꾸는 로직처럼 달라지는 부분에 집중한다.

## 직접 패턴을 적용하는 기준

1. 여러 코드에 비슷한 작업 흐름이 반복되는가?
2. 흐름 중 일부 단계만 매번 달라지는가?
3. 반복 부분에 예외 처리나 정리처럼 반드시 지켜야 할 규칙이 있는가?

그렇다면 템플릿/콜백 후보이다.

## 3장 인출

1. JDBC 코드에서 변하는 것과 변하지 않는 것을 나눠보라.
2. 전략 패턴과 템플릿/콜백의 관계를 설명하라.
3. 자원 정리를 템플릿에 넣으면 어떤 종류의 버그를 줄이는가?
4. `JdbcTemplate`을 사용해도 개발자가 결정해야 하는 것은 무엇인가?

---

# 4장. 예외

## 이 장의 질문

> 실패 정보를 잃지 않으면서, 호출자가 실제로 대응할 수 있는 의미로 어떻게 전달하는가?

## 가장 나쁜 두 방식

```java
try {
    work();
} catch (Exception e) {
    // 아무것도 하지 않음: 예외 블랙홀
}
```

실패했는데 성공한 것처럼 다음 코드가 진행된다. 로그만 남기고 정상 반환하는 것도 호출자가 실패를 알아야 한다면 충분하지 않다.

```java
void work() throws Exception { ... }
```

모든 예외를 뭉뚱그려 던지면 호출자는 무엇이 실패했고 복구 가능한지 알기 어렵다.

## 세 가지 올바른 전략

### 1. 복구

현재 계층이 대안을 알고 있을 때 정상 흐름으로 회복한다. 네트워크 일시 실패 재시도, 다른 서버 선택 등이 예다. 무한 재시도나 모든 오류의 재시도는 복구가 아니다.

### 2. 회피

현재 코드가 처리 책임을 가지지 않고 적절한 호출자에게 넘긴다. 단순히 귀찮아서 던지는 것이 아니라 호출자가 의미 있게 처리할 수 있어야 한다.

### 3. 전환

낮은 수준의 예외를 현재 계층의 의미가 담긴 예외로 바꾼다.

```java
try {
    jdbcInsert(user);
} catch (SQLException e) {
    throw new UserRegistrationException(user.getId(), e);
}
```

원인 예외 `e`를 반드시 보존해야 디버깅 정보가 사라지지 않는다.

## 왜 데이터 접근 예외를 추상화하는가

JDBC, JPA, 특정 DB는 같은 “중복 키” 상황을 서로 다른 예외로 표현할 수 있다. 비즈니스 코드가 DB 벤더별 오류 코드를 알면 기술 교체가 퍼진다. 스프링은 이를 `DataAccessException` 계층 같은 일관된 런타임 예외로 변환한다.

이는 예외를 무시한다는 뜻이 아니다. 호출자가 복구할 수 없는 체크 예외를 매번 기계적으로 전달하게 하지 않고, 필요한 곳에서는 구체 타입을 잡아 대응하게 한다.

## 판단 순서

1. 여기서 복구할 수 있는가?
2. 아니라면 누가 이 실패를 알아야 하는가?
3. 기술 예외를 그대로 전달하면 상위 계층이 기술에 종속되는가?
4. 전환한다면 원인 예외를 보존했는가?

## 4장 인출

1. 예외를 잡고 로그만 남긴 뒤 정상 반환하면 왜 위험한가?
2. 복구·회피·전환의 예를 하나씩 들어라.
3. 예외 전환 시 원인 예외를 포함해야 하는 이유는 무엇인가?
4. 스프링의 데이터 접근 예외 추상화가 기술 교체에 어떻게 도움을 주는가?

---

# 5장. 서비스 추상화

## 이 장의 질문

> 여러 DAO 작업을 하나의 트랜잭션으로 묶으면서 서비스가 JDBC 기술에 종속되지 않게 하려면?

## 비즈니스 로직부터 분명하게

사용자 등급을 올리는 예제는 처음에 조건문, 숫자, 업데이트 코드가 한 메서드에 섞인다. 다음처럼 책임을 나눌 수 있다.

- `canUpgradeLevel(user)`: 승급 가능한지 판단
- `upgradeLevel(user)`: 다음 등급으로 변경
- `userDao.update(user)`: 저장

숫자나 조건을 의미 있는 상수·enum·메서드로 표현하면 코드가 업무 용어를 드러낸다. 테스트도 “어떤 사용자가 승급되는가”를 직접 검증할 수 있다.

## 트랜잭션 경계가 서비스에 필요한 이유

여러 사용자를 승급하다 중간에 실패했을 때 앞선 사용자만 DB에 반영되면 업무 규칙이 깨질 수 있다. 전체 승급 작업을 하나의 트랜잭션으로 묶어야 한다.

문제는 DAO가 각자 연결을 만들고 닫으면 같은 트랜잭션을 공유할 수 없다는 점이다. 스프링의 트랜잭션 동기화는 현재 실행 흐름에 연결을 보관해 여러 DAO가 같은 자원을 사용하도록 돕는다.

## 서비스 추상화

JDBC는 `Connection`, JTA는 별도 API를 사용한다. 서비스가 구체 API를 직접 사용하면 실행 환경을 바꿀 때 비즈니스 코드가 바뀐다. 스프링은 일관된 트랜잭션 경계 인터페이스를 제공하고 구현체를 DI한다.

```java
class UserService {
    private final TransactionManager transactionManager;
    private final UserDao userDao;

    void upgradeLevels() {
        TransactionStatus status = transactionManager.begin();
        try {
            // 순수한 승급 작업
            transactionManager.commit(status);
        } catch (RuntimeException e) {
            transactionManager.rollback(status);
            throw e;
        }
    }
}
```

위 코드는 원리를 보여주기 위한 모양이다. 다음 장에서는 이 트랜잭션 코드마저 서비스에서 분리한다.

## PSA와 계층

PSA(Portable Service Abstraction)는 다양한 기술 구현을 일관된 서비스 인터페이스로 사용하는 방식이다.

- 수평 분리: 같은 계층에서 역할이 다른 객체를 분리 (`UserService`와 `UserDao`)
- 수직 분리: 애플리케이션 로직과 기술 서비스 계층을 분리 (비즈니스 로직과 트랜잭션 구현)

DI는 이 계층 사이를 인터페이스로 연결한다. 결과적으로 기술 구현을 바꿔도 핵심 로직의 수정이 줄어든다.

## 5장 인출

1. 트랜잭션 경계를 DAO 하나가 아니라 서비스 작업에 두는 이유는 무엇인가?
2. 여러 DAO가 같은 트랜잭션을 공유하려면 무엇을 공유해야 하는가?
3. 서비스 추상화와 단순 유틸리티 함수의 차이는 무엇인가?
4. PSA가 DI를 필요로 하는 이유를 설명하라.

---

# 6장. AOP

## 이 장의 질문

> 서비스마다 반복되는 트랜잭션 코드를 서비스 코드에서 완전히 치울 수 있는가?

## 핵심 기능과 부가기능

- 핵심 기능: 사용자 승급, 주문 생성처럼 업무 목적을 수행하는 로직
- 부가기능: 트랜잭션, 보안, 로깅, 측정처럼 여러 핵심 기능에 반복 적용되는 로직

트랜잭션 코드를 별도 클래스에 옮기고, 이 클래스가 실제 `UserService`와 같은 인터페이스를 구현하게 할 수 있다.

```text
호출자 → 트랜잭션 프록시 → 실제 UserService
                │
                ├─ 트랜잭션 시작
                ├─ 실제 메서드 호출
                └─ commit 또는 rollback
```

호출자는 같은 인터페이스만 보므로 중간 프록시의 존재를 알 필요가 없다. DI 설정이 호출자가 프록시를 바라보도록 연결한다.

## 프록시, 데코레이터, 프록시 패턴

`프록시`는 실제 대상 대신 요청을 받는 대리 객체라는 구조적 이름이다.

- 데코레이터 패턴: 같은 인터페이스로 기능을 동적으로 덧붙이는 목적
- 프록시 패턴: 접근 제어, 지연 로딩 등 대상에 대한 접근 방법을 제어하는 목적

모양이 비슷해도 의도가 다르다. 트랜잭션 부가기능은 데코레이터 성격이 강하다.

## 수동 프록시의 문제

인터페이스 메서드가 많으면 위임 메서드를 모두 작성해야 한다. 여러 서비스에 적용하면 같은 트랜잭션 코드가 프록시마다 중복된다.

Java의 리플렉션은 실행 중 타입과 메서드 정보를 다룬다. JDK 다이내믹 프록시는 인터페이스를 기준으로 위임 객체를 자동 생성하고, 공통 `InvocationHandler`가 호출을 처리하게 한다.

```java
Object invoke(Object proxy, Method method, Object[] args) {
    // before
    Object result = method.invoke(target, args);
    // after
    return result;
}
```

## FactoryBean에서 자동 프록시 생성까지

프록시는 일반 객체처럼 단순 생성하기 어려울 수 있어 FactoryBean으로 컨테이너에 등록한다. 하지만 대상마다 팩토리 빈을 설정하면 설정이 커진다.

스프링은 빈 후처리기를 이용해 빈이 만들어진 뒤 조건에 맞는 빈을 프록시로 바꿔 등록할 수 있다.

- Advice: 무엇을 할 것인가? (트랜잭션 부가기능)
- Pointcut: 어디에 적용할 것인가? (대상 클래스·메서드 조건)
- Advisor: Pointcut + Advice
- Join point: 부가기능을 끼워 넣을 수 있는 실행 지점
- Target: 실제 핵심 기능 객체
- Proxy: 호출을 가로채 Advice를 적용하고 Target에 위임하는 객체
- Aspect: 횡단 관심사의 규칙과 구현을 모듈화한 것

## AOP란 무엇인가

여러 모듈을 가로질러 흩어지는 관심사를 한 단위로 모듈화하고, **어디에 어떤 기능을 적용할지 선언**하는 프로그래밍 접근이다. 객체지향을 대체하지 않는다. 객체별 책임으로 깔끔하게 자르기 어려운 횡단 관심사를 보완한다.

## 고립된 단위 테스트와 Mockito

DI로 실제 DAO를 목 객체로 바꾸면 DB 없이 서비스 규칙만 테스트할 수 있다.

```java
UserDao dao = mock(UserDao.class);
UserService service = new UserService(dao);

service.upgradeLevels();

verify(dao).update(expectedUser);
```

목 테스트는 호출 횟수와 인자 같은 협력을 검증한다. 구현 내부 호출 순서에 지나치게 결합하면 리팩터링 때 테스트가 불필요하게 깨지므로, 중요한 상호작용만 확인한다.

## 프록시 AOP의 중요한 제한

호출자가 프록시를 거쳐야 Advice가 적용된다. 같은 객체의 한 메서드가 자기 자신의 다른 메서드를 직접 호출하는 self-invocation은 일반적인 프록시 경계를 지나지 않으므로 Advice가 적용되지 않을 수 있다.

## 6장 인출

1. 프록시와 실제 대상은 어떤 인터페이스 관계를 가져야 하는가?
2. Advice와 Pointcut의 차이를 설명하라.
3. 빈 후처리기가 자동 프록시 생성에 적합한 이유는 무엇인가?
4. self-invocation에서 프록시 AOP가 동작하지 않을 수 있는 이유는 무엇인가?

---

# 8장. 스프링이란 무엇인가

## 정의를 분해하기

> 자바 엔터프라이즈 개발을 편하게 해주는 오픈소스 경량급 애플리케이션 프레임워크

- 애플리케이션 프레임워크: 특정 한 계층만이 아니라 애플리케이션 전반의 개발을 지원한다.
- 경량급: 코드 크기가 작다는 뜻이 아니라, 과거 EJB처럼 무거운 서버·규약·개발 절차를 강제하지 않고도 엔터프라이즈 기능을 제공한다는 역사적 의미다.
- 엔터프라이즈 개발: 동시 사용자, 트랜잭션, 보안, 안정성, 자원 관리 등 기술 요구와 복잡한 업무 요구를 함께 처리한다.
- 오픈소스: 소스가 공개되고 커뮤니티 방식으로 발전하지만, 지속성과 품질 관리가 중요하다.

## 스프링이 상대하는 두 복잡성

1. 기술 복잡성: DB, 트랜잭션, 원격 호출, 보안처럼 환경마다 다른 기술
2. 비즈니스 복잡성: 회사의 규칙과 정책 자체가 복잡하고 계속 변함

기술 코드와 비즈니스 코드가 한곳에 섞이면 두 변화가 서로 증폭된다. 스프링은 DI, AOP, PSA를 이용해 기술 복잡성을 분리하고 비즈니스 객체가 업무 책임에 집중하게 한다.

## POJO

POJO(Plain Old Java Object)는 단순히 `new`로 만들 수 있는 객체라는 말보다 넓다.

- 특정 프레임워크의 클래스를 강제로 상속하거나 인터페이스를 구현하지 않는다.
- 특정 서버 환경 없이는 동작하지 않는 코드로 핵심 로직을 오염시키지 않는다.
- 객체지향 원칙을 활용할 수 있고 재사용·테스트가 쉽다.

스프링의 목적은 모든 코드에 스프링 API를 새기는 것이 아니다. 오히려 핵심 객체가 스프링을 모른 채 평범한 Java 객체로 남게 하고, 필요한 엔터프라이즈 서비스를 외부에서 제공하는 것이다.

## DI·AOP·PSA의 합성

```text
DI  : 객체와 객체의 관계를 외부에서 유연하게 연결
AOP : 여러 객체를 가로지르는 부가기능을 외부에서 적용
PSA : 구체 기술의 차이를 일관된 서비스 인터페이스 뒤에 격리
결과: POJO가 비즈니스 책임에 집중
```

## 8장 인출

1. 스프링의 “경량급”을 파일 크기로 설명하면 왜 틀리는가?
2. 기술 복잡성과 비즈니스 복잡성이 섞일 때 무슨 일이 생기는가?
3. POJO가 단순한 Java 객체 이상의 설계 개념인 이유는 무엇인가?
4. DI·AOP·PSA가 함께 POJO를 어떻게 지키는가?

---

# 1권 최종 연결 문제

다음 상황을 입으로 설명해보자.

> `OrderService.placeOrder()`가 재고 감소, 결제, 주문 저장을 수행한다. 운영에서는 실제 DB와 결제사를 사용하고, 테스트에서는 가짜 구현을 쓰고 싶다. 전체 작업은 하나의 트랜잭션이어야 하며 실행 시간을 기록해야 한다.

모범 구조:

- `OrderService`는 재고·결제·주문 저장의 **인터페이스**에 의존한다.
- 실제 구현과 가짜 구현은 **DI**로 교체한다.
- 트랜잭션 기술은 **PSA**를 통해 일관된 경계로 다룬다.
- 트랜잭션과 실행 시간 기록은 **AOP 프록시**가 적용한다.
- 서비스 규칙은 목/가짜 객체를 사용한 **단위 테스트**로, 실제 DB 연결은 **통합 테스트**로 확인한다.
