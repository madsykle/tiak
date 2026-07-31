package db

import (
	"context"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

const (
	jobsCollection  = "jobs"
	usersCollection = "users"
)

type MongoDB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func New(uri string) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	dbName := extractDBName(uri)
	db := client.Database(dbName)

	m := &MongoDB{Client: client, Database: db}

	if err := m.EnsureIndexes(ctx); err != nil {
		return nil, err
	}

	return m, nil
}

func (m *MongoDB) EnsureIndexes(ctx context.Context) error {
	jobs := m.Database.Collection(jobsCollection)

	idx := []mongo.IndexModel{
		{Keys: bson.D{{Key: "status", Value: 1}}},
		{Keys: bson.D{{Key: "category", Value: 1}}},
		{Keys: bson.D{{Key: "url", Value: 1}}},
		{Keys: bson.D{{Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "user_id", Value: 1}}},
		{Keys: bson.D{{Key: "filename", Value: 1}}},
	}

	_, err := jobs.Indexes().CreateMany(ctx, idx)
	return err
}

func (m *MongoDB) SeedAdminUser(ctx context.Context, username, email, password, role string) error {
	count, err := m.Database.Collection(usersCollection).CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	user := bson.M{
		"_id":           generateID(),
		"username":      username,
		"email":         email,
		"password_hash": string(hash),
		"role":          role,
	}

	_, err = m.Database.Collection(usersCollection).InsertOne(ctx, user)
	return err
}

func extractDBName(uri string) string {
	if idx := strings.LastIndex(uri, "/"); idx != -1 {
		dbName := uri[idx+1:]
		if qIdx := strings.Index(dbName, "?"); qIdx != -1 {
			dbName = dbName[:qIdx]
		}
		if dbName != "" {
			return dbName
		}
	}

	u, err := url.Parse(uri)
	if err == nil {
		if name := strings.TrimPrefix(u.Path, "/"); name != "" {
			return name
		}
	}

	return "tiak"
}
