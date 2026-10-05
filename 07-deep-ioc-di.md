# 심화 1. 객체지향에서 스프링 컨테이너까지

이 장은 “DI가 좋다”는 결론을 외우는 대신, 왜 객체를 만들고 사용하는 책임을 분리해야 하는지 코드의 변화로 이해한다. 공식 Spring 문서도 애플리케이션을 서로 협력하는 객체들의 집합으로 설명하며, 컨테이너가 객체를 생성하고 의존관계를 주입해 협력을 완성한다고 설명한다.

참고: [Spring 공식 문서—Dependencies](https://docs.spring.io/spring-framework/reference/core/beans/dependencies.html), [Spring 공식 문서—`@Bean`과 `@Configuration`](https://docs.spring.io/spring-framework/reference/core/beans/java/basic-concepts.html)

---

## 1. 절차적인 코드에서 객체 협력으로

회원에게 가입 환영 메시지를 보내는 코드를 생각해보자.

```java
public void register(String id, String email) {
    // 1. 회원 데이터 검증
    // 2. 데이터베이스 저장
    // 3. 이메일 전송
}
```

한 메서드에 모두 넣어도 처음에는 동작한다. 하지만 다음 요구가 생기면 문제가 드러난다.

- 회원 저장소를 MySQL에서 다른 기술로 바꾼다.
- 이메일 대신 문자 또는 푸시를 보낸다.
- 테스트에서는 실제 이메일을 보내지 않는다.
- 가입 규칙과 저장 기술을 서로 다른 사람이 수정한다.

변경 이유가 다른 코드를 역할별로 나눈다.

```java
public interface UserRepository {
    void save(User user);
    boolean existsById(String id);
}

public interface MessageSender {
    void sendWelcome(User user);
}

public final class RegistrationService {
    private final UserRepository repository;
    private final MessageSender messageSender;

    public RegistrationService(
            UserRepository repository,
            MessageSender messageSender) {
        this.repository = repository;
        this.messageSender = messageSender;
    }

    public void register(String id, String email) {
        if (repository.existsById(id)) {
            throw new DuplicateUserException(id);
        }

        User user = new User(id, email);
        repository.save(user);
        messageSender.sendWelcome(user);
    }
}
```

이 코드에서 `RegistrationService`는 다음을 안다.

- 가입 순서와 중복 가입 규칙
- `UserRepository`, `MessageSender`가 제공하는 동작

반면 다음은 모른다.

- SQL 문법과 DB 주소
- 이메일 서버 주소
- 협력 객체를 생성하는 방법

이렇게 “무엇을 하는가”는 알지만 “구체적으로 어떻게 구현되는가”는 모르는 상태가 느슨한 결합의 출발이다.

## 2. 의존성의 세 가지 모습

### 2.1 컴파일 타임 의존성

소스 코드에 드러나는 타입 관계다. 위 서비스는 `UserRepository` 인터페이스에 의존한다. 인터페이스 메서드가 바뀌면 서비스도 영향을 받는다.

### 2.2 런타임 의존성

실행할 때 실제로 연결된 객체다. 운영에서는 `JdbcUserRepository`, 테스트에서는 `MemoryUserRepository`가 될 수 있다.

```text
소스 코드: RegistrationService → UserRepository

운영 실행: RegistrationService → JdbcUserRepository
테스트 실행: RegistrationService → MemoryUserRepository
```

좋은 DI 설계에서는 컴파일 타임에는 추상 역할을 의존하고, 런타임에 구체 객체를 선택한다.

### 2.3 값 의존성

객체뿐 아니라 URL, 타임아웃, 파일 경로 같은 설정값도 외부에서 넣을 수 있다.

```java
public MailSender(String host, int timeoutMillis) { ... }
```

값을 코드에 박아두지 않으면 환경별 설정을 바꾸기 쉽다.

## 3. `new`가 문제라는 오해

`new` 자체가 나쁜 것은 아니다. 문제는 핵심 로직이 **어떤 구현을 생성할지 결정하는 책임까지 함께 가지는 것**이다.

```java
public RegistrationService() {
    this.repository = new JdbcUserRepository(
        new DriverManagerDataSource("jdbc:mysql://...")
    );
    this.messageSender = new SmtpMessageSender("smtp.example.com");
}
```

이 생성자는 비즈니스 서비스가 DB·네트워크 구성까지 안다는 것이 문제다. 객체 생성은 반드시 어딘가에서 필요하다. 그 장소를 애플리케이션 구성 영역으로 모으는 것이 핵심이다.

## 4. 스프링 없이 DI 구현하기

```java
public final class AppConfig {
    public UserRepository userRepository() {
        return new JdbcUserRepository(dataSource());
    }

    public MessageSender messageSender() {
        return new SmtpMessageSender("smtp.example.com");
    }

    public RegistrationService registrationService() {
        return new RegistrationService(
            userRepository(),
            messageSender()
        );
    }

    private DataSource dataSource() {
        return new SimpleDriverDataSource(/* 설정 */);
    }
}
```

이 팩토리가 하는 일:

1. 구체 구현을 선택한다.
2. 객체를 생성한다.
3. 필요한 의존성을 생성자에 전달한다.
4. 완성된 객체 그래프의 시작점을 반환한다.

```text
RegistrationService
 ├─ UserRepository ─ JdbcUserRepository ─ DataSource
 └─ MessageSender  ─ SmtpMessageSender
```

객체 그래프는 실행 중 서로 참조하며 협력하는 객체들의 연결 구조다.

## 5. IoC는 DI보다 넓다

일반 애플리케이션은 `main()`이 흐름을 주도하면서 라이브러리를 호출한다.

```text
내 코드 → 라이브러리 호출 → 결과 수신
```

프레임워크에서는 프레임워크가 전체 흐름을 주도하고 필요할 때 개발자 코드를 호출한다.

```text
프레임워크 → 등록된 내 객체 생성 → 적절한 시점에 내 메서드 호출
```

서블릿 컨테이너가 서블릿을 만들고 요청 때 `service()`를 호출하는 것도 IoC다. DI는 이 큰 원리를 객체 관계 설정에 적용한 대표 방식이다.

## 6. 스프링 컨테이너가 하는 일

```java
@Configuration
public class SpringConfig {
    @Bean
    public RegistrationService registrationService(
            UserRepository repository,
            MessageSender messageSender) {
        return new RegistrationService(repository, messageSender);
    }

    @Bean
    public UserRepository userRepository(DataSource dataSource) {
        return new JdbcUserRepository(dataSource);
    }

    @Bean
    public MessageSender messageSender() {
        return new SmtpMessageSender("smtp.example.com");
    }
}
```

공식 문서상 `@Bean` 메서드는 컨테이너가 관리할 객체를 생성·설정·초기화한다. `@Configuration` 클래스는 빈 정의의 출처다. 메서드 파라미터는 해당 빈 생성에 필요한 의존성을 표현한다.

컨테이너 시작 과정은 개념적으로 다음과 같다.

```text
1. 설정 메타정보 읽기
2. BeanDefinition 등록
3. 필요한 빈과 생성 순서 계산
4. 객체 생성
5. 의존성 주입
6. 초기화 콜백과 빈 후처리
7. 완성된 빈 저장 및 제공
8. 컨테이너 종료 시 소멸 콜백
```

`BeanDefinition`은 클래스, 팩토리 메서드, 스코프, 초기화 방법, 의존관계 등 빈을 만들기 위한 레시피에 가깝다. 실제 객체 그 자체가 아니다.

## 7. BeanFactory와 ApplicationContext

### BeanFactory

- 빈 생성과 조회
- 의존관계 해결
- 스코프와 생명주기 관리

### ApplicationContext

BeanFactory 역할을 포함하면서 다음과 같은 애플리케이션 기능을 제공한다.

- 이벤트 발행
- 메시지 국제화
- 리소스 로딩
- 환경과 프로파일
- 빈 후처리기 자동 탐지

실무에서 “스프링 컨테이너”라고 말하면 대체로 `ApplicationContext`를 뜻한다.

## 8. 빈을 등록하는 세 방식

### 8.1 명시적 Java 설정

```java
@Bean
UserRepository userRepository(DataSource dataSource) {
    return new JdbcUserRepository(dataSource);
}
```

장점: 객체 생성 과정과 외부 라이브러리 객체 등록이 명확하다.

### 8.2 컴포넌트 스캔

```java
@Repository
class JdbcUserRepository implements UserRepository { ... }

@Service
class RegistrationService { ... }
```

`@Component` 계열 애노테이션이 붙은 클래스를 검색해 빈 정의로 등록한다. 간편하지만 넓은 스캔 범위와 숨은 의존관계 때문에 구조가 흐려지지 않도록 패키지 경계를 관리해야 한다.

### 8.3 XML

```xml
<bean id="registrationService" class="example.RegistrationService">
    <constructor-arg ref="userRepository" />
    <constructor-arg ref="messageSender" />
</bean>
```

토비의 스프링 3.1에는 XML이 많이 등장한다. 표현 형식이 다를 뿐 “객체 생성과 관계를 코드 밖의 메타정보로 기술한다”는 원리는 같다.

## 9. 생성자·수정자·필드 주입

### 생성자 주입

```java
public Service(Repository repository) {
    this.repository = repository;
}
```

- 필수 의존성이 객체 생성 시 확정된다.
- `final` 필드를 사용할 수 있다.
- 스프링 없이 단위 테스트할 수 있다.
- 의존성이 너무 많으면 클래스 책임이 과도하다는 신호가 보인다.

### 수정자 주입

```java
public void setNotifier(Notifier notifier) {
    this.notifier = notifier;
}
```

선택적이거나 재설정 가능한 의존성에 사용할 수 있지만, 설정 전 불완전 상태가 존재할 수 있다.

### 필드 주입

```java
@Autowired
private Repository repository;
```

짧지만 객체를 평범하게 생성하기 어렵고 필수 의존성이 생성자 시그니처에 드러나지 않는다. 학습 예제와 애플리케이션 코드에서는 생성자 주입을 기본으로 삼는 편이 구조를 이해하기 쉽다.

## 10. 같은 타입의 빈이 여러 개라면

```java
@Bean
MessageSender emailSender() { ... }

@Bean
MessageSender smsSender() { ... }
```

`MessageSender` 하나를 주입하려 하면 후보가 둘이라 모호하다.

- `@Primary`: 기본 후보 지정
- `@Qualifier`: 이름/한정자로 후보 지정
- `List<MessageSender>`: 같은 타입의 모든 빈 주입
- 명시적인 `@Bean` 메서드 파라미터 구성

중요한 점은 애노테이션 암기가 아니라 “선택 규칙이 모호하면 컨테이너도 결정할 수 없다”는 것이다.

## 11. 스코프를 수명과 공유 범위로 이해하기

공식 문서에 따르면 스프링 singleton은 **컨테이너별·빈 정의별 한 객체**다. JVM 전체에 단 하나라는 GoF Singleton과 다르다.

참고: [Spring 공식 문서—Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html)

| 스코프 | 생성 시점/개수 | 흔한 용도 |
|---|---|---|
| singleton | 컨테이너에서 공유하는 한 인스턴스 | 무상태 서비스, 저장소 |
| prototype | 컨테이너에 요청할 때마다 새 객체 | 상태를 가진 단기 작업 객체 |
| request | HTTP 요청마다 한 객체 | 요청 범위 상태 |
| session | HTTP 세션마다 한 객체 | 로그인 세션 범위 상태 |

### singleton에 상태를 두면 생기는 문제

```java
@Service
class PriceService {
    private String currentUser; // 위험

    Money calculate(String user, Item item) {
        currentUser = user;
        // 동시에 다른 요청이 값을 덮어쓸 수 있음
    }
}
```

여러 스레드가 같은 인스턴스를 사용하므로 요청별 변경 상태를 필드에 저장하지 않는다. 필수 설정값이나 불변 협력 객체는 필드로 두어도 된다.

### singleton에 prototype을 주입할 때

singleton 생성 시 의존성 주입은 한 번 일어난다. 따라서 prototype 빈을 생성자에 직접 주입하면 그 한 인스턴스가 계속 사용될 수 있다. 매번 새 인스턴스가 필요하면 `ObjectProvider`, 스코프 프록시, 팩토리 같은 지연 조회 방법이 필요하다.

## 12. 생명주기와 빈 후처리기

빈 생성 직후 모든 기능이 끝나는 것은 아니다.

```text
생성 → 의존성 주입 → 초기화 전 후처리
     → 초기화 콜백 → 초기화 후 후처리 → 사용
     → 소멸 콜백
```

빈 후처리기(`BeanPostProcessor`)는 생성된 빈을 검사하거나 다른 객체로 감쌀 수 있다. 자동 프록시 생성기가 이 지점을 이용해 원본 빈 대신 AOP 프록시를 노출한다. 1장의 IoC가 6장의 AOP를 가능하게 하는 연결 고리다.

## 13. 순환 의존성

```text
OrderService → PaymentService → OrderService
```

생성자 주입에서는 두 객체 중 어느 것도 먼저 완성할 수 없다. 설정 요령으로 숨기기보다 책임이 잘못 나뉘었는지 먼저 확인한다.

해결 후보:

- 공통 책임을 세 번째 객체로 추출
- 한쪽 방향의 이벤트나 콜백으로 변경
- 두 서비스가 실제로 하나의 책임인지 재검토
- 정말 불가피할 때만 지연 참조 사용

## 14. DI가 테스트를 바꾸는 방식

```java
final class MemoryUserRepository implements UserRepository {
    private final Map<String, User> users = new HashMap<>();

    public void save(User user) {
        users.put(user.id(), user);
    }

    public boolean existsById(String id) {
        return users.containsKey(id);
    }
}

final class RecordingMessageSender implements MessageSender {
    User sentTo;

    public void sendWelcome(User user) {
        sentTo = user;
    }
}
```

```java
@Test
void 신규_회원은_저장되고_환영_메시지를_받는다() {
    var repository = new MemoryUserRepository();
    var sender = new RecordingMessageSender();
    var service = new RegistrationService(repository, sender);

    service.register("alice", "alice@example.com");

    assertTrue(repository.existsById("alice"));
    assertEquals("alice", sender.sentTo.id());
}
```

스프링 컨테이너 없이도 테스트된다. 이것이 POJO와 DI의 중요한 결과다. 스프링 테스트는 컨테이너 설정 자체를 검증할 때 사용하면 된다.

## 15. 흔한 오해 교정

### “인터페이스는 모든 클래스에 만들어야 한다”

아니다. 구현 교체 경계, 외부 시스템 경계, 테스트 대역이 유용한 경계, 여러 정책 구현이 존재하는 경계에서 특히 가치가 있다. 의미 없는 1:1 인터페이스는 구조만 늘릴 수 있다.

### “`@Autowired`가 DI다”

`@Autowired`는 스프링이 의존성을 찾아 연결하는 한 방법이다. 생성자로 직접 객체를 전달해도 DI다.

### “컨테이너가 설계를 대신한다”

컨테이너는 우리가 정한 객체와 관계를 관리한다. 어떤 책임을 분리하고 어떤 방향으로 의존할지는 개발자의 설계 책임이다.

### “Bean은 특별한 Java 객체다”

Bean은 컨테이너가 관리한다는 상태를 가리킨다. 객체의 Java 문법적 종류가 별도로 존재하는 것은 아니다.

## 16. 장 마무리 실습

다음 요구를 코드로 표현한다.

> 주문을 저장한 뒤 알림을 보낸다. 운영에서는 JDBC와 이메일, 테스트에서는 메모리 저장소와 기록용 알림을 쓴다.

필수 조건:

1. `OrderService` 안에서 구체 구현을 `new`하지 않는다.
2. 테스트는 스프링 컨테이너 없이 실행한다.
3. 운영 구성은 `@Configuration`, `@Bean`으로 작성한다.
4. 객체 그래프를 종이에 그린다.

### 스스로 답할 질문

1. 인터페이스는 컴파일 타임 의존성과 런타임 의존성을 어떻게 분리하는가?
2. `AppConfig`와 `ApplicationContext`의 공통점과 차이는?
3. 스프링 singleton과 GoF Singleton은 어떻게 다른가?
4. 빈 후처리기가 AOP와 연결되는 이유는?
5. DI를 적용해도 나쁜 설계가 가능한 이유는?
