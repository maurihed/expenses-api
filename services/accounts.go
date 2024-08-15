package services

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type Account struct {
	ID     string `json:"id,omitempty" bson:"_id,omitempty"`
	Name   string `json:"name,omitempty" bson:"name,omitempty"`
	Amount int    `json:"amount,omitempty" bson:"amount,omitempty"`
	UserId string `json:"userId,omitempty" bson:"userId,omitempty"`
}

var client *mongo.Client

func New(mongo *mongo.Client) Account {
	client = mongo
	log.Printf("Service created")
	return Account{}
}

func getCollectionPointer(collectionName string) *mongo.Collection {
	return client.Database("expenses").Collection(collectionName)
}
func (a *Account) InsertAccount(entry Account) error {
	collection := getCollectionPointer("accounts")
	_, err := collection.InsertOne(context.TODO(), Account{
		Name:   entry.Name,
		Amount: entry.Amount,
		UserId: entry.UserId,
	})

	if err != nil {
		log.Printf("Error inserting account: %v", err)
		return err
	}

	return nil
}

// GetAllTodos returns all the todos form the db
func (t *Account) GetAccountsByUserId(userId string) ([]Account, error) {
	collection := getCollectionPointer("accounts")
	var accounts []Account

	cursor, err := collection.Find(context.TODO(), bson.D{{Key: "userId", Value: userId}})
	if err != nil {
		log.Fatal(err)
		return nil, err
	}

	defer cursor.Close(context.Background())

	for cursor.Next(context.Background()) {
		var account Account
		cursor.Decode(&account)
		accounts = append(accounts, account)
	}

	return accounts, nil
}

func (t *Account) UpdateAccount(id string, entry Account) (*mongo.UpdateResult, error) {
	collection := getCollectionPointer("accounts")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}

	update := bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "name", Value: entry.Name},
			{Key: "amount", Value: entry.Amount},
		}},
	}

	res, err := collection.UpdateOne(
		context.Background(),
		bson.M{"_id": mongoID},
		update,
	)

	if err != nil {
		log.Println(err)
		return nil, err
	}

	return res, nil
}
