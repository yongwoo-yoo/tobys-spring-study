# 2권 보충: AOP·LTW·테스트 컨텍스트

링크의 2권 부분은 범위가 짧다. 1권 6장에서 만든 프록시 AOP를 실제 스프링 설정 방식으로 확장하고, 테스트 컨텍스트가 컨테이너를 효율적으로 재사용하는 원리를 다룬다.

# 5장. AOP와 LTW

## 세 가지 AOP 적용 시점

| 방식 | 적용 시점 | 대표 기술 | 감각 |
|---|---|---|---|
| 컴파일 타임 위빙 | 소스/Aspect를 컴파일할 때 | AspectJ compiler | 결과 클래스에 기능이 엮여 나옴 |
| 로드 타임 위빙(LTW) | JVM이 클래스를 로드할 때 | AspectJ weaver + agent | 로딩 순간 바이트코드 변환 |
| 런타임 프록시 | 컨테이너가 빈을 구성할 때 | Spring AOP | 대상 앞에 프록시 객체 배치 |

스프링 AOP는 주로 프록시 기반이라 Spring Bean의 메서드 실행을 가로챈다. AspectJ는 클래스 자체를 위빙할 수 있어 더 넓은 지점에 적용 가능하지만 구성과 운영 복잡도도 커질 수 있다.

## Aspect를 구성하는 요소

```java
@Aspect
class TimingAspect {
    @Around("execution(* com.example.service..*(..))")
    Object measure(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.nanoTime();
        try {
            return joinPoint.proceed();
        } finally {
            System.out.println(System.nanoTime() - start);
        }
    }
}
```

- `@Aspect`: 이 클래스가 횡단 관심사 모듈임을 표시
- `@Around`: 대상 호출 전후 모두에 개입하는 Advice
- Pointcut 표현식: 적용할 메서드의 조건
- `proceed()`: 실제 대상 또는 다음 Advice 호출

`proceed()`를 호출하지 않으면 실제 핵심 로직이 실행되지 않는다. 두 번 호출하면 두 번 실행될 수 있다. Around Advice는 강력한 만큼 흐름을 분명히 이해해야 한다.

## 자동 프록시 생성

스프링은 빈 후처리기가 생성된 빈을 검사한다.

1. 빈 생성
2. Advisor의 Pointcut과 일치하는지 검사
3. 일치하면 원본 대신 프록시 생성
4. 프록시를 컨테이너에 등록
5. 다른 빈은 DI를 통해 프록시를 받음

`@EnableAspectJAutoProxy`는 `@Aspect` 스타일의 자동 프록시 지원을 켠다. 이름에 AspectJ가 들어가지만 보통의 스프링 설정에서는 AspectJ 문법을 활용하는 **프록시 기반 Spring AOP**라는 점을 구분한다.

## JDK 프록시와 클래스 프록시

- JDK 동적 프록시: 인터페이스를 기반으로 프록시 생성
- CGLIB 계열 클래스 프록시: 대상 클래스를 상속한 프록시 생성

클래스 프록시는 `final` 클래스/메서드와 private 메서드 등에 제약이 있다. 어느 방식이든 외부 호출이 프록시를 통과해야 한다는 경계가 중요하다.

## LTW는 언제 생각하는가

프록시가 가로챌 수 없는 생성자, 필드 접근, Spring Bean이 아닌 객체 등 더 넓은 join point가 필요할 때 AspectJ 위빙을 고려할 수 있다. `@EnableLoadTimeWeaving`은 로드 타임 위빙 구성을 지원한다. 단순한 서비스 트랜잭션·로깅이라면 먼저 프록시 AOP로 충분한지 판단한다.

## 확인 문제

1. Spring AOP와 AspectJ 위빙의 적용 지점은 어떻게 다른가?
2. `Advice`, `Pointcut`, `Advisor`, `Aspect`를 각각 설명하라.
3. `@EnableAspectJAutoProxy`가 있다고 항상 바이트코드 위빙을 하는 것은 아닌 이유는?
4. Around Advice에서 `proceed()`는 어떤 의미인가?

# 6장. 테스트 컨텍스트 프레임워크

스프링 통합 테스트마다 `ApplicationContext`를 새로 만들면 설정 해석, 빈 생성, DB 연결 준비 때문에 느리다. 테스트 컨텍스트 프레임워크는 테스트 클래스의 설정 정보를 읽고 컨텍스트를 생성·캐시·공유한다.

## 큰 흐름

```text
JUnit 테스트 실행
  → Spring 확장 기능이 테스트 생명주기에 참여
  → 설정 위치/클래스 확인
  → 같은 키의 ApplicationContext가 캐시에 있는지 확인
  → 있으면 재사용, 없으면 생성
  → 테스트 인스턴스에 빈 주입
  → 트랜잭션·SQL·컨텍스트 정리 같은 리스너 기능 적용
```

컨텍스트 캐시 키가 달라지면 새 컨텍스트가 만들어진다. 테스트마다 사소하게 다른 설정을 만들면 캐시 적중률이 떨어진다.

## `@DirtiesContext`

테스트가 싱글톤 빈 상태나 컨테이너 구성을 오염시켰다면 캐시에서 해당 컨텍스트를 제거하도록 표시한다. 문제를 숨기는 만능 초기화 버튼이 아니다. 먼저 빈을 무상태로 만들거나 테스트 데이터를 롤백하는 편이 가능한지 살핀다.

## 테스트 범위 선택

1. 순수 Java 단위 테스트로 가능한가? 가능하면 컨테이너 없이 실행한다.
2. 빈 연결이나 스프링 기능을 확인해야 하는가? 필요한 설정만 로딩한다.
3. 전체 애플리케이션 흐름이 필요한가? 전체 통합 테스트를 사용한다.

GitHub 보충 자료의 슬라이스 테스트는 이 원칙의 현대적 사례다. 웹 계층, JPA 계층 등 필요한 조각만 컨텍스트에 올려 속도와 현실성 사이를 조정한다.

## 확인 문제

1. 테스트 컨텍스트 캐시는 왜 필요한가?
2. 순수 단위 테스트에서 스프링 컨텍스트를 띄우지 않는 이유는?
3. `@DirtiesContext` 남용이 성능에 미치는 영향은?
4. 슬라이스 테스트가 전체 통합 테스트와 다른 점은?

# 두 자료에서 추가로 연결되는 현대적 주제

추가 GitHub 저장소는 원래 GitBook 범위보다 넓다. 다음은 핵심 원리를 익힌 뒤 확장할 순서다.

1. ApplicationContext 부가기능: `Environment`, `MessageSource`, `ResourceLoader`, 애플리케이션 이벤트
2. 데이터 접근: `DataSource`, `JdbcTemplate`, 커넥션 풀, MyBatis/JPA
3. Spring MVC: `DispatcherServlet`, 핸들러 매핑, 컨트롤러, 뷰 리졸버
4. Spring Boot: 자동 설정, 외부 설정, 내장 서버, 테스트 슬라이스

처음부터 모두 섞지 말자. IoC/DI → 테스트 → 템플릿 → 트랜잭션 → AOP가 잡힌 뒤 보면 이 기능들이 “별도 암기 대상”이 아니라 같은 원리의 응용으로 보인다.
