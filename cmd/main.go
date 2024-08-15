package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/maurihed/expenses-api/db"
	"github.com/maurihed/expenses-api/handlers"
	"github.com/maurihed/expenses-api/services"
)

type Application struct {
	Models services.Models
}

func main() {
	mongoClient, err := db.ConnectToMongo()
	if err != nil {
		log.Panic(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	defer func() {
		if err = mongoClient.Disconnect(ctx); err != nil {
			panic(err)
		}
	}()

	services.New(mongoClient)

	log.Printf("Starting server on port 8000")
	log.Fatal(http.ListenAndServe(":8000", handlers.CreateRouter()))
}

// func initServices(mongoClient *mongo.Client) {
// 	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
// 	defer cancel()

// 	defer func() {
// 		if err := mongoClient.Disconnect(ctx); err != nil {
// 			log.Fatal(err)
// 		}
// 	}()

// 	services.New(mongoClient)
// }
