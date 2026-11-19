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

# Entre comillas: sin ellas, ENV separa por espacios y solo la primera opcion llegaba a la JVM
ENV JAVA_TOOL_OPTIONS="-XX:TieredStopAtLevel=1 -Dspring.main.lazy-initialization=true -Dspring.jmx.enabled=false"

EXPOSE 8080

USER appuser

CMD ["java","-jar","./app.jar"] 