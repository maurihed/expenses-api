include .env

up:
	@echo "Starting containers..."
	docker compose up --build -d --remove-orphans

down:
	@echo "Stopping containers..."
	docker compose down

build:
	go build -o ${BINARY} cmd/main.go

start:
	./${BINARY}

restart: build start
