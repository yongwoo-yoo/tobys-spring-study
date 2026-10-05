# 심화 3. 트랜잭션·서비스 추상화·AOP 완전 연결

이 장의 목표는 `@Transactional`을 붙이는 법이 아니라 다음 실행 구조를 이해하는 것이다.

```text
호출자
  → 트랜잭션 프록시
      → TransactionManager로 시작
      → 실제 서비스 호출
      → 성공이면 commit, 실패면 rollback
  → 결과 또는 예외 반환
```

참고: [Spring 공식 문서—Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html), [선언적 트랜잭션의 구현 원리](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html), [Spring AOP 개념](https://docs.spring.io/spring-framework/reference/core/aop/introduction-defn.html), [AOP 프록시](https://docs.spring.io/spring-framework/reference/core/aop/introduction-proxies.html)

---

## 1. 트랜잭션이 필요한 실제 이유

계좌 A에서 B로 10,000원을 이체한다.

```text
1. A 잔액 확인
2. A에서 10,000원 차감
3. B에 10,000원 추가
4. 이체 기록 저장
```

2번 후 3번이 실패하면 돈이 사라진다. 각각의 SQL은 성공했지만 업무 전체는 실패했다. 트랜잭션 경계는 개별 SQL이 아니라 **업무가 일관성을 유지하는 단위**에 맞춰야 한다.

## 2. ACID를 암기 대신 문제로 이해하기

### Atomicity—원자성

여러 작업이 전부 반영되거나 전부 취소된다. 이체의 출금만 반영되는 일을 막는다.

### Consistency—일관성

트랜잭션 전후에 시스템이 정한 제약과 업무 규칙을 만족해야 한다. 잔액이 음수가 될 수 없다는 규칙 등이 예다. DB 제약뿐 아니라 애플리케이션 규칙도 포함된다.

### Isolation—격리성

동시에 실행되는 트랜잭션들이 서로의 중간 상태를 어떻게 볼지 정한다. 격리가 강할수록 이해하기 쉽지만 동시성이 낮아질 수 있다.

### Durability—지속성

커밋된 결과는 장애가 발생해도 보존되어야 한다. DB의 로그와 저장장치 정책 등이 관련된다.

## 3. 동시성 이상 현상

### Dirty read

다른 트랜잭션이 아직 커밋하지 않은 값을 읽는다. 상대가 롤백하면 존재하지 않았어야 할 값을 사용한 셈이다.

### Non-repeatable read

한 트랜잭션에서 같은 행을 두 번 읽었는데 그 사이 다른 트랜잭션이 수정·커밋해 값이 달라진다.

### Phantom read

같은 조건으로 여러 행을 다시 조회했는데 다른 트랜잭션의 삽입·삭제 때문에 행 집합이 달라진다.

격리 수준 이름만 외우기보다 “우리 업무가 어떤 동시 변경을 허용하고, DB가 어떤 보장을 주는가?”를 판단한다. DB 구현에 따라 세부 동작이 다를 수 있다.

## 4. JDBC로 직접 트랜잭션 경계 잡기

```java
Connection connection = dataSource.getConnection();
try {
    connection.setAutoCommit(false);

    withdraw(connection, fromAccount, amount);
    deposit(connection, toAccount, amount);
    saveHistory(connection, transfer);

    connection.commit();
} catch (Exception e) {
    connection.rollback();
    throw e;
} finally {
    connection.close();
}
```

세 DAO 작업이 같은 트랜잭션에 참여하려면 **같은 Connection**을 사용해야 한다. DAO가 호출마다 새 연결을 얻는다면 하나의 로컬 트랜잭션으로 묶이지 않는다.

## 5. Connection을 파라미터로 넘기는 방식의 문제

```java
accountDao.withdraw(connection, ...);
accountDao.deposit(connection, ...);
historyDao.save(connection, ...);
```

- 서비스가 JDBC 타입을 알게 된다.
- 모든 DAO 메서드 시그니처가 기술 객체에 오염된다.
- JPA나 JTA 같은 다른 기술로 교체하기 어렵다.
- 비즈니스 코드와 트랜잭션 관리 코드가 섞인다.

## 6. 트랜잭션 동기화

Spring은 현재 실행 흐름에 연결된 자원을 보관하고 데이터 접근 코드가 같은 자원을 사용하게 할 수 있다.

```text
서비스: 트랜잭션 시작
  → 현재 스레드에 Connection 바인딩
DAO A: DataSource에서 현재 트랜잭션 Connection 획득
DAO B: 같은 Connection 획득
서비스: commit/rollback
  → Connection 반환 및 바인딩 해제
```

명령형 Spring 트랜잭션은 일반적으로 스레드에 바인딩된다. 공식 문서는 새로 시작한 스레드로 이 컨텍스트가 자동 전파되지 않는다는 점을 설명한다. 비동기·리액티브 흐름에서는 다른 모델을 사용해야 한다.

## 7. TransactionManager라는 서비스 추상화

트랜잭션 구현마다 API가 다르다.

- JDBC 로컬 트랜잭션
- JPA 트랜잭션
- 여러 자원을 조정하는 JTA
- 리액티브 트랜잭션

Spring은 일관된 트랜잭션 추상화를 제공한다. 명령형 코드에서는 `PlatformTransactionManager`, 리액티브에서는 `ReactiveTransactionManager`가 중심이다.

```text
TransferService
       ↓ 일관된 경계 API
PlatformTransactionManager
       ├─ DataSourceTransactionManager/JdbcTransactionManager
       ├─ JpaTransactionManager
       └─ JtaTransactionManager
```

구현체는 설정과 DI로 선택한다. 서비스의 업무 로직은 구체 기술을 덜 알게 된다.

## 8. 프로그램 방식과 선언 방식

### 프로그램 방식

코드에서 시작·커밋·롤백을 명시한다.

```java
transactionTemplate.execute(status -> {
    transferMoney(command);
    return null;
});
```

장점: 경계와 제어가 코드에 명확하고 동적인 흐름을 세밀하게 다룰 수 있다.

### 선언 방식

메타데이터로 경계를 선언한다.

```java
@Transactional
public void transfer(TransferCommand command) {
    accountRepository.withdraw(command.from(), command.amount());
    accountRepository.deposit(command.to(), command.amount());
    transferRepository.save(command);
}
```

장점: 비즈니스 코드에 반복 경계 코드가 거의 남지 않는다. Spring 공식 문서는 선언적 트랜잭션이 AOP 프록시와 트랜잭션 메타데이터로 구현된다고 설명한다.

## 9. `@Transactional` 호출의 실제 순서

```text
1. 컨테이너가 서비스 빈을 생성
2. 자동 프록시 생성기가 트랜잭션 메타데이터 발견
3. 실제 서비스 대신 프록시를 다른 빈에 주입
4. 외부 호출자가 프록시 메서드 호출
5. TransactionInterceptor가 속성 확인
6. 적절한 TransactionManager 선택
7. 기존 트랜잭션 참여 또는 새 트랜잭션 시작
8. 실제 서비스 메서드 호출
9. 반환/예외에 따라 commit 또는 rollback
10. 자원 정리 후 결과/예외 전달
```

애노테이션 자체가 트랜잭션을 수행하지 않는다. 애노테이션은 메타데이터고, 프록시와 인터셉터가 실행을 담당한다.

## 10. 전파 속성

전파는 트랜잭션 메서드가 이미 트랜잭션 안에서 호출될 때 어떻게 행동할지 정한다.

### REQUIRED

기존 트랜잭션이 있으면 참여하고 없으면 새로 만든다. 일반적인 기본값이다.

```text
외부 트랜잭션 있음 → 같은 트랜잭션 참여
외부 트랜잭션 없음 → 새 트랜잭션
```

### REQUIRES_NEW

기존 트랜잭션을 잠시 중단하고 별도 트랜잭션을 시작한다. 내부 작업이 커밋돼도 외부 작업은 롤백될 수 있고 그 반대도 가능하다. 별도 커넥션이 필요할 수 있어 풀 크기와 교착 위험을 고려한다.

### SUPPORTS

기존 트랜잭션이 있으면 참여하고 없으면 트랜잭션 없이 실행한다.

### MANDATORY

반드시 기존 트랜잭션 안에서만 실행한다. 없으면 예외다.

### NOT_SUPPORTED

기존 트랜잭션을 중단하고 트랜잭션 없이 실행한다.

### NEVER

트랜잭션이 있으면 예외다.

### NESTED

지원되는 환경에서 savepoint를 이용해 내부 일부를 롤백할 수 있다. `REQUIRES_NEW`처럼 완전히 독립된 물리 트랜잭션과 같지 않다.

처음에는 REQUIRED를 확실히 이해하고, 나머지는 실제 업무 요구가 있을 때 선택한다.

## 11. 논리 트랜잭션과 물리 트랜잭션

두 REQUIRED 메서드가 같은 물리 트랜잭션에 참여하더라도 각 메서드 경계는 논리 트랜잭션처럼 동작한다.

내부 참여자가 rollback-only로 표시하면 바깥 코드가 커밋을 시도해도 전체 물리 트랜잭션은 롤백될 수 있다. 겉으로 내부 예외를 잡았는데 최종 커밋에서 예상치 못한 롤백 오류가 나는 이유를 이해하려면 이 구분이 필요하다.

## 12. 롤백 규칙

Spring 선언적 트랜잭션의 기본 규칙은 일반적으로 다음과 같다.

- `RuntimeException`과 `Error`: 롤백
- 체크 예외: 기본적으로 커밋 대상

업무 요구가 다르면 명시한다.

```java
@Transactional(rollbackFor = PaymentCheckedException.class)
public void pay(...) throws PaymentCheckedException { ... }
```

중요한 것은 모든 예외에 무조건 rollbackFor를 붙이는 것이 아니라, 실패가 업무 변경을 되돌려야 하는지 판단하는 것이다.

## 13. readOnly, timeout, isolation

```java
@Transactional(
    readOnly = true,
    timeout = 3,
    isolation = Isolation.READ_COMMITTED
)
public Report loadReport(...) { ... }
```

- `readOnly`: 읽기 전용 의도를 전달한다. 구체 최적화와 강제 여부는 기술에 따라 다르다.
- `timeout`: 일정 시간 이상 걸리는 트랜잭션을 제한한다.
- `isolation`: 동시 트랜잭션 가시성 수준을 정한다.

설정값 이름을 아는 것보다 DB와 트랜잭션 관리자에서 실제로 어떻게 적용되는지 확인하는 것이 중요하다.

## 14. 트랜잭션 경계를 어디에 두는가

보통 하나의 업무 유스케이스를 조정하는 서비스 메서드에 둔다.

```java
@Transactional
public Order placeOrder(PlaceOrder command) {
    customerPolicy.validate(command.customerId());
    stock.decrease(command.items());
    payment.authorize(command.payment());
    return orderRepository.save(Order.create(command));
}
```

주의: 원격 결제 API까지 DB 트랜잭션 안에 오래 포함하면 DB 연결과 락을 오래 보유한다. DB 트랜잭션이 원격 시스템까지 원자성을 보장하지도 않는다. 외부 시스템이 포함된 일관성은 보상 작업, 이벤트, outbox, idempotency 같은 별도 설계가 필요할 수 있다.

## 15. AOP가 필요한 이유

트랜잭션 코드의 구조는 여러 서비스에 반복된다.

```text
시작
try {
    핵심 로직
    커밋
} catch {
    롤백
    재던지기
}
```

상속이나 단순 유틸리티로 해결하려 하면 서비스 타입과 호출 구조가 제약된다. 프록시는 호출 경계에서 공통 기능을 적용하고 실제 대상에 위임한다.

## 16. 프록시를 손으로 작성하기

```java
public final class TransactionalTransferService
        implements TransferService {
    private final TransferService target;
    private final TransactionManager transactionManager;

    public TransactionalTransferService(
            TransferService target,
            TransactionManager transactionManager) {
        this.target = target;
        this.transactionManager = transactionManager;
    }

    @Override
    public void transfer(TransferCommand command) {
        TransactionStatus status = transactionManager.begin();
        try {
            target.transfer(command);
            transactionManager.commit(status);
        } catch (RuntimeException e) {
            transactionManager.rollback(status);
            throw e;
        }
    }
}
```

호출자는 `TransferService`만 보므로 실제 구현인지 프록시인지 모른다. 그러나 모든 메서드 위임을 손으로 쓰는 것은 반복이 많다.

## 17. JDK 동적 프록시

```java
InvocationHandler handler = (proxy, method, args) -> {
    TransactionStatus status = txManager.begin();
    try {
        Object result = method.invoke(target, args);
        txManager.commit(status);
        return result;
    } catch (InvocationTargetException e) {
        txManager.rollback(status);
        throw e.getTargetException();
    }
};

TransferService proxy = (TransferService) Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    new Class<?>[]{TransferService.class},
    handler
);
```

JDK 동적 프록시는 인터페이스를 바탕으로 런타임 프록시 클래스를 만든다. `InvocationHandler`가 공통 호출 로직을 담당한다.

## 18. Spring AOP 핵심 용어

공식 문서 기준으로 정리한다.

- Aspect: 여러 클래스에 걸친 관심사의 모듈
- Join point: 프로그램 실행 중 기능을 적용할 수 있는 지점. Spring AOP에서는 항상 메서드 실행
- Advice: join point에서 수행할 행동
- Pointcut: 어떤 join point를 선택할지 정하는 조건
- Target: Advice가 적용되는 실제 객체
- AOP proxy: Aspect 계약을 구현하기 위해 만든 대리 객체
- Weaving: Aspect와 대상 타입/객체를 연결하는 과정

Spring AOP는 런타임 프록시 방식으로 위빙한다.

## 19. Advice 종류

- Before: 대상 메서드 전에 실행
- After returning: 정상 반환 뒤 실행
- After throwing: 예외 종료 시 실행
- After/finally: 성공·실패와 무관하게 실행
- Around: 호출 전후를 감싸고 실제 호출 여부까지 결정

공식 문서는 요구를 충족하는 가장 단순한 Advice를 권장한다. 단순 기록에 Around를 사용하면 `proceed()` 누락처럼 불필요한 실수 가능성이 생긴다.

## 20. Pointcut 읽는 법

```java
execution(* com.example.order..*Service.*(..))
```

개념적으로 다음을 뜻한다.

```text
execution(                    메서드 실행 중에서
  *                           반환 타입 무관
  com.example.order..         해당 패키지와 하위 패키지
  *Service                    이름이 Service로 끝나는 타입
  .*                          모든 메서드
  (..)                        파라미터 종류·개수 무관
)
```

너무 넓은 Pointcut은 의도하지 않은 빈에 기능을 적용한다. 의미 있는 패키지·애노테이션·메서드 경계로 제한하고 테스트한다.

## 21. JDK 프록시와 클래스 기반 프록시

공식 문서에 따르면 Spring AOP는 JDK 동적 프록시 또는 CGLIB 기반 프록시를 사용한다.

### JDK 동적 프록시

- 인터페이스 기반
- 호출자는 인터페이스 타입으로 프록시를 사용

### 클래스 기반 프록시

- 대상 클래스를 상속한 하위 클래스 형태
- 인터페이스가 없어도 가능
- `final` 클래스/메서드와 private 메서드 등은 재정의 제약 때문에 Advice 적용이 제한될 수 있음

두 방식 모두 핵심은 **호출이 프록시 객체를 통과해야 한다**는 점이다.

## 22. self-invocation 문제

```java
@Service
public class UserService {
    public void outer() {
        inner(); // this.inner()와 같음
    }

    @Transactional(propagation = REQUIRES_NEW)
    public void inner() { ... }
}
```

외부 호출은 `프록시 → target.outer()`로 들어오지만, `outer()` 내부의 `inner()` 호출은 target의 `this`를 향한다.

```text
외부 → proxy → target.outer()
                  └→ this.inner()  // proxy를 다시 지나지 않음
```

그래서 `inner()`의 별도 Advice가 적용되지 않을 수 있다.

해결의 첫 선택은 트랜잭션 경계를 책임에 맞게 다른 빈으로 분리하는 것이다.

```text
OuterService → 프록시된 InnerService.inner()
```

자기 프록시 조회 같은 우회는 코드가 AOP 인프라에 강하게 결합하므로 신중히 사용한다.

## 23. private 메서드와 실제 호출 경계

private 메서드는 외부 클라이언트가 호출하는 서비스 계약이 아니며 프록시가 재정의해 가로채는 지점도 아니다. 트랜잭션 경계는 외부에서 호출되는 공개된 유스케이스 메서드에 두는 것이 이해하기 쉽다.

## 24. 자동 프록시 생성기

```text
빈 정의 로딩
 → 대상 빈 생성
 → BeanPostProcessor가 Advisor와 매칭
 → 일치하는 메서드가 있으면 프록시 생성
 → 원본 대신 프록시를 컨테이너에 노출
 → 다른 빈에는 프록시가 주입됨
```

이 때문에 객체 생성과 관계를 컨테이너가 제어하는 IoC가 AOP의 기반이 된다.

## 25. AspectJ와 LTW

Spring AOP의 목적은 Spring Bean의 메서드 실행에 흔한 엔터프라이즈 기능을 적용하는 것이다. 필드 접근, 생성자, 컨테이너 밖의 객체 등 더 넓은 join point가 필요하면 AspectJ를 고려할 수 있다.

- compile-time weaving: 컴파일 과정에서 Aspect 연결
- load-time weaving: JVM이 클래스를 로드할 때 바이트코드 변환
- Spring AOP: 런타임에 프록시 객체 구성

Spring AOP와 AspectJ는 우열보다 적용 범위와 복잡도가 다르다.

## 26. 트랜잭션 테스트에서 주의할 점

테스트 메서드 자체가 트랜잭션이고 끝에서 롤백되면 편리하지만 다음을 가릴 수 있다.

- 운영에서는 커밋 시점에 발생하는 DB 제약 오류
- 영속성 컨텍스트 flush 이전에는 보이지 않는 SQL 오류
- 실제 여러 요청에 걸친 동작

필요한 경우 `flush()`를 명시하거나, 커밋을 포함하는 별도 통합 테스트를 둔다. 롤백 테스트와 실제 운영 경로 테스트는 목적이 다르다.

## 27. 흔한 실패 시나리오

### 애노테이션을 붙였는데 트랜잭션이 없다

- 객체를 직접 `new`해 프록시가 아님
- self-invocation
- 적용 대상 메서드/가시성 문제
- 트랜잭션 기능 활성화 또는 관리자 설정 누락
- 예상과 다른 프록시 방식

### 예외가 났는데 커밋됐다

- 예외를 잡고 정상 반환함
- 체크 예외인데 롤백 규칙을 지정하지 않음
- 실제 트랜잭션 경계 밖에서 실행됨

### REQUIRES_NEW 때문에 풀 고갈

- 바깥 트랜잭션이 연결을 보유한 채 내부 새 트랜잭션이 추가 연결을 요구
- 동시 요청 수에 비해 커넥션 풀이 부족

## 28. 장 마무리 설계 문제

다음 주문 흐름을 설계한다.

```text
재고 차감 → 주문 저장 → 결제 요청 → 주문 완료
```

질문:

1. DB 트랜잭션에 포함할 범위는 어디까지인가?
2. 원격 결제가 실패하면 이미 변경한 DB 상태를 어떻게 할 것인가?
3. 결제 성공 후 응답 유실로 재시도되면 중복 결제를 어떻게 막을 것인가?
4. 트랜잭션과 실행 시간 로깅은 어느 Advice로 적용할 것인가?
5. 단위 테스트와 통합 테스트에서 각각 무엇을 검증할 것인가?

단순히 `@Transactional` 하나로 외부 시스템까지 원자성을 얻을 수 없다는 점을 설명할 수 있어야 한다.

## 29. 최종 확인 문제

1. 여러 DAO가 같은 로컬 트랜잭션에 참여하려면 무엇을 공유해야 하는가?
2. `PlatformTransactionManager`는 어떤 기술 차이를 추상화하는가?
3. 애노테이션이 아니라 프록시가 트랜잭션을 실행한다는 말의 의미는?
4. REQUIRED와 REQUIRES_NEW의 물리 트랜잭션 관계는?
5. 내부 메서드 호출에서 Advice가 빠질 수 있는 이유는?
6. Spring AOP와 AspectJ를 join point 범위로 비교하라.
7. 원격 API 호출을 DB 트랜잭션에 오래 포함할 때 어떤 문제가 생기는가?
