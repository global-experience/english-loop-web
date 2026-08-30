.PHONY: dev prod down

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

prod:
	docker compose up --build

down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down
