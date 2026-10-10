# Etapa: Builder
FROM maven:3.9.6-eclipse-temurin-21-alpine AS builder

WORKDIR /app

COPY pom.xml .

RUN mvn dependency:go-offline -B

COPY src ./src

RUN mvn clean package -DskipTests

# Etapa: Runtime
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

RUN adduser -D -H -u 1000 appuser

EXPOSE 8080

USER appuser

CMD ["java","-jar","./app.jar"] 