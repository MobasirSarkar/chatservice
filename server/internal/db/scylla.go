package db

import (
	"log"

	"github.com/gocql/gocql"
)

func DbConnect() *gocql.Session {
	cluster := gocql.NewCluster("127.0.0.1:9042")
	cluster.Keyspace = "system"
	session, err := cluster.CreateSession()
	if err != nil {
		log.Fatalf("Failed to connect to cluster: %v", err)
	}
	return session
}

func EnsureKeyspace(session *gocql.Session) {
	if err := session.Query(`
        CREATE KEYSPACE IF NOT EXISTS chat
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor' : 1}
    `).Exec(); err != nil {
		log.Fatalf("Failed to create keyspace: %v", err)
	}
}
