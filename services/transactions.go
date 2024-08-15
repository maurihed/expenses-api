package services

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type Transaction struct {
	ID          string `json:"id,omitempty" bson:"_id,omitempty"`
	ACCOUNT_ID  string `json:"accountId,omitempty" bson:"accountId,omitempty"`
	AMOUNT      int    `json:"amount,omitempty" bson:"amount,omitempty"`
	CATEGORY    string `json:"category,omitempty" bson:"category,omitempty"`
	DATE        string `json:"date,omitempty" bson:"date,omitempty"`
	DESCRIPTION string `json:"description,omitempty" bson:"description,omitempty"`
	TYPE        string `json:"type,omitempty" bson:"type,omitempty"`
}

func (t *Transaction) GetTransactionsByUserId(userId string) ([]Transaction, error) {
	account := &Account{}
	accounts, err := account.GetAccountsByUserId(userId)
	if err != nil {
		log.Fatal(err)
		return nil, err
	}
	accountsIds := make([]string, len(accounts))
	for i, account := range accounts {
		accountsIds[i] = account.ID
	}
	collection := getCollectionPointer("transactions")

	var transactions []Transaction
	cursor, err := collection.Find(context.TODO(), bson.D{{Key: "accountId", Value: bson.D{{Key: "$in", Value: accountsIds}}}})
	if err != nil {
		log.Fatal(err)
		return nil, err
	}
	defer cursor.Close(context.Background())
	for cursor.Next(context.Background()) {
		var transaction Transaction
		cursor.Decode(&transaction)
		transactions = append(transactions, transaction)
	}
	return transactions, nil
}

func (t *Transaction) InsertTransaction(entry Transaction) error {
	collection := getCollectionPointer("transactions")
	_, err := collection.InsertOne(context.TODO(), Transaction{
		ACCOUNT_ID:  entry.ACCOUNT_ID,
		AMOUNT:      entry.AMOUNT,
		CATEGORY:    entry.CATEGORY,
		DATE:        entry.DATE,
		DESCRIPTION: entry.DESCRIPTION,
		TYPE:        entry.TYPE,
	})

	if err != nil {
		log.Printf("Error inserting transaction: %v", err)
		return err
	}

	return nil
}

func (t *Transaction) UpdateTransaction(id string, entry Transaction) (*mongo.UpdateResult, error) {
	collection := getCollectionPointer("transactions")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}

	update := bson.D{
		{"$set", bson.D{
			{"accountId", entry.ACCOUNT_ID},
			{"amount", entry.AMOUNT},
			{"category", entry.CATEGORY},
			{"date", entry.DATE},
			{"description", entry.DESCRIPTION},
			{"type", entry.TYPE},
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

func (t *Transaction) DeleteTransaction(id string) error {
	collection := getCollectionPointer("transactions")
	mongoID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Println(err)
		return err
	}

	_, err = collection.DeleteOne(
		context.Background(),
		bson.M{"_id": mongoID},
	)
	if err != nil {
		log.Println(err)
		return err
	}

	return nil
}
