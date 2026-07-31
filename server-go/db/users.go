package db

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"tiak-server/models"
)

func (m *MongoDB) users() *mongo.Collection {
	return m.Database.Collection(usersCollection)
}

func (m *MongoDB) CreateUser(ctx context.Context, user *models.User) error {
	_, err := m.users().InsertOne(ctx, user)
	return err
}

func (m *MongoDB) FindUserByUsername(ctx context.Context, username string) (*models.User, error) {
	var user models.User
	err := m.users().FindOne(ctx, bson.M{"username": username}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (m *MongoDB) FindUserByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User
	err := m.users().FindOne(ctx, bson.M{"_id": id}).Decode(&user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (m *MongoDB) CountUsersByUsernameOrEmail(ctx context.Context, username, email string) (int64, error) {
	count, err := m.users().CountDocuments(ctx, bson.M{
		"$or": []bson.M{
			{"username": username},
			{"email": email},
		},
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (m *MongoDB) ListUsers(ctx context.Context) ([]models.User, error) {
	cursor, err := m.users().Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var users []models.User
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (m *MongoDB) UpdateUserRole(ctx context.Context, id, role string) error {
	_, err := m.users().UpdateByID(ctx, id, bson.M{"$set": bson.M{"role": role}})
	return err
}
