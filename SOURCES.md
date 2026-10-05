# 활용 자료와 범위

## 주 자료

- [Incheol's TECH BLOG — 토비의 스프링 (3.1)](https://incheol-jung.gitbook.io/docs/study/tobys-spring)
  - 활용 범위: 1권 1~6장·8장, 2권 AOP/LTW 및 테스트 컨텍스트
  - 역할: 책의 문제 전개와 핵심 개념 순서

- [pjok1122/Spring-Summary](https://github.com/pjok1122/Spring-Summary)
  - 활용 범위: IoC Container, ApplicationContext, AOP, Spring Data Access, Test
  - 역할: 컨테이너 종류·빈 등록/주입·현대 테스트 슬라이스·데이터 접근 API 등 보충

## 사용 원칙

- 원문을 대체하는 복제가 아니라 초심자용 설명과 학습 순서로 재구성했다.
- 두 자료의 범위를 넘어서는 설명은 개념 연결과 현대적 맥락을 위한 보충이다.
- Spring 3.1 시대 API와 현대 Spring/Spring Boot 사용법은 구분한다.
- 실제 프로젝트의 Spring 및 JUnit 버전에 따라 애노테이션과 설정법은 달라질 수 있다.

## 심화 설명 검증에 사용한 공식 문서

- [Spring Framework—Dependencies](https://docs.spring.io/spring-framework/reference/core/beans/dependencies.html)
- [Spring Framework—`@Bean`과 `@Configuration`](https://docs.spring.io/spring-framework/reference/core/beans/java/basic-concepts.html)
- [Spring Framework—Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html)
- [Spring Framework—JdbcTemplate과 오류 처리](https://docs.spring.io/spring-framework/reference/data-access/jdbc/core.html)
- [Spring Framework—Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)
- [Spring Framework—선언적 트랜잭션 구현 원리](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html)
- [Spring Framework—AOP Concepts](https://docs.spring.io/spring-framework/reference/core/aop/introduction-defn.html)
- [Spring Framework—AOP Proxies](https://docs.spring.io/spring-framework/reference/core/aop/introduction-proxies.html)
- [Spring Framework—TestContext Framework](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework.html)
- [JUnit User Guide](https://docs.junit.org/current/user-guide/)

공식 문서는 계속 갱신된다. 이 교재는 토비의 스프링 3.1의 역사적 설명을 유지하면서, 2026년 10월 확인한 공식 문서의 현재 개념과 주의점을 함께 반영했다.
