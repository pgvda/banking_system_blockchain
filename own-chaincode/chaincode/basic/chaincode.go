package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for managing users
type SmartContract struct {
	contractapi.Contract
}

// User defines the structure for a user in the banking system
type User struct {
	Username string `json:"username"`
	Role string `json:"role"`         // SuperAdmin | Admin | Manager | User
	Email string `json:"email"`
	NationalID string `json:"nationalId"`
	BankBranch string `json:"bankBranch"`
	IsActive bool `json:"isActive"`
	RegisteredAt string `json:"registeredAt"` // ISO date string
	CreatedBy string `json:"createdBy"`    // CN or userId who created this user
	DataHash string `"json:"dataHash""`
}

type TransactionHistory struct {
	DepositUser string `json:"depositUser"`
	Amount string `json:"amount"`
	Date stirng `json:"date"`
	Time string `json:"time"`
	HistoryHash string `json:"historyHash"`
}

// ======= Helper functions for caller identity & attributes =======

// getClientRole returns the value of the 'role' attribute in the caller's certificate (if present)
func getClientRole(ctx contractapi.TransactionContextInterface) (string, bool, error) {
	cid := ctx.GetClientIdentity()
	role, found, err := cid.GetAttributeValue("role")
	if err != nil {
		return "", false, fmt.Errorf("error reading role attribute: %v", err)
	}
	return role, found, nil
}

// getClientMSP returns the MSP ID of the caller
func getClientMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	cid := ctx.GetClientIdentity()
	mspID, err := cid.GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to get caller MSPID: %v", err)
	}
	return mspID, nil
}

// requireRole asserts that the caller has one of the allowed roles
func requireRole(ctx contractapi.TransactionContextInterface, allowed ...string) error {
	role, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("caller has no 'role' attribute in certificate")
	}
	for _, a := range allowed {
		if role == a {
			return nil
		}
	}
	return fmt.Errorf("access denied: caller role '%s' not in allowed set %v", role, allowed)
}

// getCallerCN returns the Common Name (CN) from the caller's certificate
func getCallerCN(ctx contractapi.TransactionContextInterface) (string, error) {
	cid := ctx.GetClientIdentity()
	cert, err := cid.GetX509Certificate()
	if err == nil && cert != nil {
		return cert.Subject.CommonName, nil
	}
	// Fallback to client identity string if certificate object not available
	subject, err := cid.GetID()
	if err != nil {
		return "", fmt.Errorf("failed to get caller identity: %v", err)
	}
	cn := extractCN(subject)
	if cn == "" {
		return subject, nil
	}
	return cn, nil
}

// extractCN parses CN from a subject string that may look like "x509::/CN=alice::..."
func extractCN(subject string) string {
	start := strings.Index(subject, "CN=")
	if start == -1 {
		return ""
	}
	// find end marker '::' after CN=
	remaining := subject[start+3:]
	end := strings.Index(remaining, "::")
	if end == -1 {
		return remaining
	}
	return remaining[:end]
}

// ======= Chaincode functions =======

// InitialUser adds some default users to the ledger (for testing/demos)
func (s *SmartContract) InitialUser(ctx contractapi.TransactionContextInterface) error {
	// Only SuperAdmin or Admin may call this in production—here we permit Admin/SuperAdmin
	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return fmt.Errorf("permission denied for InitialUser: %v", err)
	}

	users := []User{
		{
			ID:           "user1",
			Username:     "Vidusha",
			Role:         "Admin",
			Email:        "pgvidushadilshan@gmail.com",
			NationalID:   "993140490v",
			BankBranch:   "Godakawela",
			IsActive:     true,
			RegisteredAt: "2025-07-31",
		},
		{
			ID:           "user2",
			Username:     "Dilshan",
			Role:         "User",
			Email:        "dilshanariyarathna1999@gmail.com",
			NationalID:   "993140490",
			BankBranch:   "Godakawela",
			IsActive:     true,
			RegisteredAt: "2025-07-31",
		},
	}

	cn, _ := getCallerCN(ctx)
	for _, user := range users {
		user.CreatedBy = cn
		userJSON, err := json.Marshal(user)
		if err != nil {
			return err
		}
		if err := ctx.GetStub().PutState(user.ID, userJSON); err != nil {
			return fmt.Errorf("failed to store user %s: %v", user.ID, err)
		}
	}
	return nil
}

// UserExists checks if a user exists in the ledger
func (s *SmartContract) UserExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	if id == "" {
		return false, fmt.Errorf("id argument is required")
	}
	userJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read user: %v", err)
	}
	return userJSON != nil, nil
}

// CreateUser creates a new user with RBAC enforcement
func (s *SmartContract) CreateUser(ctx contractapi.TransactionContextInterface, id string, username string, role string, email string, nationalID string, bankBranch string, registeredAt string) error {
	// Validate inputs
	if id == "" || username == "" || role == "" {
		return fmt.Errorf("id, username and role are required")
	}

	// Get caller role
	callerRole, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("caller has no role attribute in certificate")
	}

	// Enforce role creation policy:
	// - Only SuperAdmin can create Admin
	// - Admin or SuperAdmin can create Manager and User
	switch role {
	case "Admin":
		if callerRole != "SuperAdmin" {
			return fmt.Errorf("only SuperAdmin can create Admin accounts")
		}
	case "Manager", "User":
		if callerRole != "SuperAdmin" && callerRole != "Admin" {
			return fmt.Errorf("only SuperAdmin or Admin can create Manager/User accounts")
		}
	default:
		return fmt.Errorf("invalid role: %s. Allowed roles: SuperAdmin, Admin, Manager, User", role)
	}

	// Check existence
	exists, err := s.UserExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the user %s already exists", id)
	}

	// Build user object
	cn, _ := getCallerCN(ctx)
	user := User{
		ID:           id,
		Username:     username,
		Role:         role,
		Email:        email,
		NationalID:   nationalID,
		BankBranch:   bankBranch,
		IsActive:     true,
		RegisteredAt: registeredAt,
		CreatedBy:    cn,
	}

	userJSON, err := json.Marshal(user)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(id, userJSON)
}

// GetUser fetches a user by ID
func (s *SmartContract) GetUser(ctx contractapi.TransactionContextInterface, id string) (*User, error) {
	if id == "" {
		return nil, fmt.Errorf("id argument is required")
	}
	userJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read user %s: %v", id, err)
	}
	if userJSON == nil {
		return nil, fmt.Errorf("user %s does not exist", id)
	}

	var user User
	if err := json.Unmarshal(userJSON, &user); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user %s: %v", id, err)
	}
	return &user, nil
}

// GetAllUsers returns all users stored in the ledger
func (s *SmartContract) GetAllUsers(ctx contractapi.TransactionContextInterface) ([]*User, error) {
	// Only Admin or SuperAdmin can list all users (sensible default)
	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return nil, fmt.Errorf("permission denied: %v", err)
	}

	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to get state by range: %v", err)
	}
	defer resultsIterator.Close()

	var users []*User
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		var user User
		if err := json.Unmarshal(queryResponse.Value, &user); err != nil {
			// skip malformed entries, but log (chaincode cannot log to stdout reliably in all setups)
			continue
		}
		users = append(users, &user)
	}
	return users, nil
}

// UpdateUser updates editable fields of a user (only Admin or SuperAdmin)
func (s *SmartContract) UpdateUser(ctx contractapi.TransactionContextInterface, id string, username string, email string, bankBranch string) error {
	if id == "" {
		return fmt.Errorf("id argument is required")
	}
	// Only Admin or SuperAdmin
	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return fmt.Errorf("permission denied: %v", err)
	}

	user, err := s.GetUser(ctx, id)
	if err != nil {
		return err
	}

	// Update allowed fields
	if username != "" {
		user.Username = username
	}
	if email != "" {
		user.Email = email
	}
	if bankBranch != "" {
		user.BankBranch = bankBranch
	}

	userJSON, err := json.Marshal(user)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(id, userJSON)
}

// DeactivateUser marks a user as inactive (and should be revoked by CA separately)
func (s *SmartContract) DeactivateUser(ctx contractapi.TransactionContextInterface, id string) error {
	if id == "" {
		return fmt.Errorf("id argument is required")
	}
	// Only Admin or SuperAdmin may deactivate
	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return fmt.Errorf("permission denied: %v", err)
	}

	user, err := s.GetUser(ctx, id)
	if err != nil {
		return err
	}

	if !user.IsActive {
		return fmt.Errorf("user %s is already inactive", id)
	}

	user.IsActive = false
	userJSON, err := json.Marshal(user)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(id, userJSON)
}

// AuthenticateUser returns info about the caller (CN, role, MSP) — useful for debugging and client checks
func (s *SmartContract) AuthenticateUser(ctx contractapi.TransactionContextInterface) (string, error) {
	cn, err := getCallerCN(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to obtain caller CN: %v", err)
	}
	role, found, err := getClientRole(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to obtain role attribute: %v", err)
	}
	msp, err := getClientMSP(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to obtain MSP: %v", err)
	}
	roleStr := "none"
	if found {
		roleStr = role
	}
	return fmt.Sprintf("CN=%s, MSP=%s, role=%s", cn, msp, roleStr), nil
}

func (s*SmartContract) CreateTransactionHistory(ctx contractapi.TransactionContextInterface, depositUser string, amount string, date string, time string, historyHash string) error {
	if depositUser == "" || amount == "" || historyHash == "" {
		return fmt.Errorf("deposit, amount, historyHash required")
	}

	callerRole, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("caller has no role attribute in certificate")
	}
}

// ======= Main =======
func main() {
	chaincode, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Printf("Error creating user chaincode: %v\n", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting user chaincode: %v\n", err)
	}
}
