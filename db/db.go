package db

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"github.com/maurihed/expenses-api/config"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type PGConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

type MongoDBConfig struct {
	Host     string
	User     string
	Password string
	DBName   string
}

func NewPgSQLStorage(cfg PGConfig) (*sql.DB, error) {
	psqlInfo := fmt.Sprintf("host=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.Host, cfg.User, cfg.Password, cfg.DBName)

	log.Println(psqlInfo)

	db, err := sql.Open("postgres", psqlInfo)

	if err != nil {
		log.Fatal(err)
	}

	return db, nil
}

func ConnectToMongo() (*mongo.Client, error) {
	clientOptions := options.Client().ApplyURI(fmt.Sprintf("mongodb+srv://%s", config.Envs.DBHost))

	username := config.Envs.DBUser
	password := config.Envs.DBPassword

	clientOptions.SetAuth(options.Credential{
		Username: username,
		Password: password,
	})

	client, err := mongo.Connect(context.Background(), clientOptions)

	if err != nil {
		log.Fatal(err)
		return nil, err
	}

	log.Printf("Connected to MongoDB...")
	return client, nil
}
