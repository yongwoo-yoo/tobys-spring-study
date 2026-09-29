# 선수지식: 아무 배경 없이 시작하기

## 1. 프로그램, 클래스, 객체

프로그램은 컴퓨터가 실행하는 명령의 모음이다. Java에서는 관련 데이터와 동작을 `class`라는 설계도에 묶는다. 그 설계도로 실행 중에 만든 실체가 `object`다.

```java
class User {
    private String id;

    User(String id) {
        this.id = id;
    }

    String getId() {
        return id;
    }
}

User user = new User("alice"); // 객체 생성
```

- 필드: 객체가 기억하는 상태 (`id`)
- 메서드: 객체가 수행하는 동작 (`getId`)
- 생성자: 객체가 처음 만들어질 때 필요한 값을 받는 특별한 코드
- 참조: 실제 객체를 가리키는 변수 (`user`)

## 2. 객체는 혼자 일하지 않는다

`UserService`가 사용자를 저장하려면 `UserDao`의 도움이 필요하다. 이때 `UserService`는 `UserDao`에 **의존한다**.

```java
class UserService {
    private final UserDao userDao;

    UserService(UserDao userDao) {
        this.userDao = userDao;
    }
}
```

의존은 나쁜 것이 아니다. 소프트웨어는 협력으로 동작한다. 문제는 상위 정책 코드가 특정 구현에 단단히 묶이는 것이다.

```java
// 강한 결합: 서비스가 구현체 생성 방법까지 안다.
private final UserDao userDao = new MySqlUserDao();

// 느슨한 결합: 서비스는 약속만 알고 구현체를 외부에서 받는다.
private final UserRepository userRepository;
```

## 3. 인터페이스와 다형성

인터페이스는 “이 역할을 맡으려면 이런 동작을 제공하라”는 약속이다.

```java
interface MessageSender {
    void send(String message);
}

class EmailSender implements MessageSender {
    public void send(String message) { /* 이메일 전송 */ }
}

class FakeSender implements MessageSender {
    public void send(String message) { /* 테스트용 기록 */ }
}
```

클라이언트가 `EmailSender`가 아니라 `MessageSender`를 바라보면 이메일 구현을 테스트용 구현이나 문자 구현으로 교체할 수 있다. 같은 호출이 실제 객체에 따라 다르게 동작하는 성질이 **다형성**이다.

## 4. 객체지향 설계의 기본 어휘

### 관심사의 분리

서로 다른 이유로 변하는 코드를 분리한다. SQL 변경과 DB 연결 방식 변경은 이유가 다르므로 같은 메서드에 뒤섞지 않는다.

### 응집도와 결합도

- 높은 응집도: 한 모듈의 코드가 하나의 뚜렷한 책임을 위해 모여 있다.
- 낮은 결합도: 한 모듈의 변경이 다른 모듈에 적게 전파된다.

### OCP와 SRP

- 개방-폐쇄 원칙(OCP): 새 기능을 **확장**하기는 쉽고, 이미 검증된 코드를 **수정**할 필요는 적어야 한다.
- 단일 책임 원칙(SRP): 클래스가 변경되는 이유는 하나여야 한다.

이 원칙은 “클래스는 무조건 작아야 한다”는 규칙이 아니다. 변경 이유와 책임의 경계를 판단하는 도구다.

### 자주 등장하는 패턴

- 전략 패턴: 바뀌는 알고리즘을 인터페이스 뒤로 분리해 교체한다.
- 팩토리: 객체를 생성하고 조립하는 책임을 맡는다.
- 템플릿 메서드: 상위 클래스가 흐름을 정하고 일부 단계를 하위 클래스가 구현한다.
- 데코레이터: 같은 인터페이스를 유지한 채 대상 앞뒤에 기능을 덧붙인다.
- 프록시: 실제 대상 대신 앞에 서서 접근 제어·지연 로딩·부가기능 등을 수행한다.

## 5. 데이터베이스와 JDBC

관계형 데이터베이스는 데이터를 표 형태로 저장한다. SQL은 데이터를 추가·조회·수정·삭제하는 언어다.

```sql
INSERT INTO users(id, name) VALUES ('alice', '앨리스');
SELECT id, name FROM users WHERE id = 'alice';
```

JDBC는 Java가 DB와 대화할 때 사용하는 표준 API다. 일반 흐름은 다음과 같다.

1. `Connection` 획득
2. SQL을 담을 `PreparedStatement` 생성
3. SQL 실행
4. 조회라면 `ResultSet`을 Java 객체로 변환
5. 사용한 자원 닫기

DAO(Data Access Object)는 이런 데이터 접근 책임을 전담하는 객체다. JDBC는 표준 인터페이스지만 연결 생성·자원 정리·예외 처리 코드가 반복되기 쉬우며, 이것이 1~4장의 재료가 된다.

## 6. 트랜잭션

트랜잭션은 여러 작업을 하나의 논리적 작업 단위로 묶는다. 계좌이체에서 출금만 되고 입금이 실패하면 안 된다.

```text
트랜잭션 시작
  A 계좌에서 10,000원 차감
  B 계좌에 10,000원 추가
둘 다 성공 → commit
하나라도 실패 → rollback
```

- 원자성: 전부 성공하거나 전부 실패한다.
- `commit`: 변경을 확정한다.
- `rollback`: 변경을 취소한다.
- 트랜잭션 경계: 어디서 시작하고 끝낼지 정한 범위다.

여러 DAO 호출을 묶어야 하므로 보통 서비스 계층이 경계를 잡는다. 그러나 서비스 코드에 DB API가 들어오면 비즈니스 로직과 기술 코드가 섞인다. 5~6장은 이를 해결한다.

## 7. 예외

예외는 정상 흐름을 계속할 수 없는 상황을 나타내는 객체다.

```java
try {
    repository.save(user);
} catch (DuplicateKeyException e) {
    // 중복 사용자라는 의미에 맞는 대응
}
```

- 체크 예외: 컴파일러가 처리 또는 선언을 강제한다.
- 언체크 예외: `RuntimeException` 계열로 강제하지 않는다.
- 예외를 잡고 아무것도 하지 않으면 원인과 실패 사실이 사라진다.
- 의미 없는 `throws Exception`도 호출자에게 책임만 떠넘긴다.

## 8. 테스트의 기본 구조

테스트는 준비(Arrange), 실행(Act), 검증(Assert)으로 읽는다.

```java
@Test
void findsSavedUser() {
    // 준비
    User user = new User("alice");
    repository.save(user);

    // 실행
    User found = repository.findById("alice");

    // 검증
    assertEquals("alice", found.getId());
}
```

- 단위 테스트: 작은 대상 하나를 빠르고 고립되게 확인한다.
- 통합 테스트: DB나 스프링 컨테이너 등 여러 요소의 결합을 확인한다.
- 테스트 픽스처: 테스트에 필요한 객체와 데이터의 준비 상태다.
- 테스트 더블: 진짜 협력 객체 대신 쓰는 가짜 객체다. Stub은 답을 제공하고, Mock은 상호작용도 검증한다.

## 9. 람다 이전의 콜백 감각

어떤 동작을 객체로 전달하면 공통 흐름 속 특정 단계만 바꿀 수 있다.

```java
interface Work {
    void run();
}

void execute(Work work) {
    System.out.println("공통 준비");
    work.run();
    System.out.println("공통 정리");
}
```

`execute`는 템플릿, 전달한 `Work`는 콜백에 가깝다. 현대 Java에서는 함수형 인터페이스와 람다로 더 간결하게 표현하지만 책의 익명 내부 클래스도 같은 원리를 보여준다.

## 준비도 점검

다음 질문에 한두 문장으로 답할 수 있으면 본편으로 가자.

1. 클래스와 객체는 어떻게 다른가?
2. 인터페이스를 사이에 두면 무엇을 교체할 수 있는가?
3. DAO는 어떤 책임을 맡는가?
4. 트랜잭션에서 rollback은 왜 필요한가?
5. 단위 테스트와 통합 테스트의 목적은 어떻게 다른가?
