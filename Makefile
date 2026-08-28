.PHONY: up down test build

up:
	docker compose up --build

down:
	docker compose down

test:
	docker compose --profile test run --rm web-test

build:
	docker build -t loopine .
