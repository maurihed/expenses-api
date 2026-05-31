FROM golang:1.22.6-alpine3.20

WORKDIR /app
COPY . .
RUN go get -d -v ./...
RUN go build -o api ./cmd/main.go

EXPOSE 3000

CMD ["./api"]
