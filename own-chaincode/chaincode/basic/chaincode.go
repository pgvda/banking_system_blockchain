package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// ======================== Contract ========================

type SmartContract struct {
	contractapi.Contract
}

// ======================== Structs ==========================

// User object stored in ledger
type User struct {
	ID           string `json:"id"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	Email        string `json:"email"`
	NationalID   string `json:"nationalId"`
	BankBranch   string `json:"bankBranch"`
	IsActive     bool   `json:"isActive"`
	RegisteredAt string `json:"registeredAt"`
	CreatedBy    string `json:"createdBy"`
	DataHash     string `json:"dataHash"`
}

type TransactionHistory struct {
	DepositUser  string `json:"depositUser"`
	Amount       string `json:"amount"`
	Date         string `json:"date"`
	Time         string `json:"time"`
	HistoryHash  string `json:"historyHash"`
}

// ======================== Identity Helpers ========================

func getClientRole(ctx contractapi.TransactionContextInterface) (string, bool, error) {
	cid := ctx.GetClientIdentity()
	role, found, err := cid.GetAttributeValue("role")
	if err != nil {
		return "", false, fmt.Errorf("error reading role attribute: %v", err)
	}
	return role, found, nil
}

func getClientMSP(ctx contractapi.TransactionContextInterface) (string, error) {
	cid := ctx.GetClientIdentity()
	mspID, err := cid.GetMSPID()
	if err != nil {
		return "", fmt.Errorf("failed to get MSP ID: %v", err)
	}
	return mspID, nil
}

func requireRole(ctx contractapi.TransactionContextInterface, allowed ...string) error {
	role, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("caller has no 'role' attribute in certificate")
	}
	for _, v := range allowed {
		if role == v {
			return nil
		}
	}
	return fmt.Errorf("access denied: caller role '%s' not in allowed set %v", role, allowed)
}

func getCallerCN(ctx contractapi.TransactionContextInterface) (string, error) {
	cid := ctx.GetClientIdentity()
	cert, err := cid.GetX509Certificate()
	if err == nil && cert != nil {
		return cert.Subject.CommonName, nil
	}
	subject, err := cid.GetID()
	if err != nil {
		return "", fmt.Errorf("failed to get caller identity: %v", err)
	}
	return extractCN(subject), nil
}

func extractCN(subject string) string {
	start := strings.Index(subject, "CN=")
	if start == -1 {
		return subject
	}
	s := subject[start+3:]
	end := strings.Index(s, "::")
	if end == -1 {
		return s
	}
	return s[:end]
}

// ======================== Chaincode Methods ========================

// Add initial users
func (s *SmartContract) InitialUser(ctx contractapi.TransactionContextInterface) error {

	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return fmt.Errorf("permission denied: %v", err)
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

	for _, u := range users {
		u.CreatedBy = cn
		data, _ := json.Marshal(u)
		if err := ctx.GetStub().PutState(u.ID, data); err != nil {
			return err
		}
	}

	return nil
}

// Check user existence
func (s *SmartContract) UserExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	if id == "" {
		return false, fmt.Errorf("id is required")
	}
	data, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, err
	}
	return data != nil, nil
}

// Create user with RBAC
func (s *SmartContract) CreateUser(
	ctx contractapi.TransactionContextInterface,
	id string, username string, role string,
	email string, nationalID string, bankBranch string, registeredAt string,
) error {

	if id == "" || username == "" || role == "" {
		return fmt.Errorf("id, username and role required")
	}

	callerRole, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("no role attribute in certificate")
	}

	// RBAC Rules
	switch role {
	case "Admin":
		if callerRole != "SuperAdmin" {
			return fmt.Errorf("only SuperAdmin can create Admin")
		}
	case "Manager", "User":
		if callerRole != "SuperAdmin" && callerRole != "Admin" {
			return fmt.Errorf("only Admin/SuperAdmin can create Manager/User")
		}
	default:
		return fmt.Errorf("invalid role: %s", role)
	}

	exists, _ := s.UserExists(ctx, id)
	if exists {
		return fmt.Errorf("user %s already exists", id)
	}

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

	data, _ := json.Marshal(user)
	return ctx.GetStub().PutState(id, data)
}

// Fetch user
func (s *SmartContract) GetUser(ctx contractapi.TransactionContextInterface, id string) (*User, error) {
	if id == "" {
		return nil, fmt.Errorf("id required")
	}
	data, err := ctx.GetStub().GetState(id)
	if err != nil || data == nil {
		return nil, fmt.Errorf("user %s not found", id)
	}

	var u User
	json.Unmarshal(data, &u)
	return &u, nil
}

// Get all users
func (s *SmartContract) GetAllUsers(ctx contractapi.TransactionContextInterface) ([]*User, error) {

	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return nil, err
	}

	iter, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var list []*User

	for iter.HasNext() {
		res, _ := iter.Next()
		var u User
		if json.Unmarshal(res.Value, &u) == nil {
			list = append(list, &u)
		}
	}

	return list, nil
}

// Update user
func (s *SmartContract) UpdateUser(ctx contractapi.TransactionContextInterface, id, username, email, bankBranch string) error {

	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return err
	}

	u, err := s.GetUser(ctx, id)
	if err != nil {
		return err
	}

	if username != "" {
		u.Username = username
	}
	if email != "" {
		u.Email = email
	}
	if bankBranch != "" {
		u.BankBranch = bankBranch
	}

	data, _ := json.Marshal(u)
	return ctx.GetStub().PutState(id, data)
}

// Deactivate user
func (s *SmartContract) DeactivateUser(ctx contractapi.TransactionContextInterface, id string) error {

	if err := requireRole(ctx, "SuperAdmin", "Admin"); err != nil {
		return err
	}

	u, err := s.GetUser(ctx, id)
	if err != nil {
		return err
	}

	u.IsActive = false
	data, _ := json.Marshal(u)
	return ctx.GetStub().PutState(id, data)
}

// Caller identity info
func (s *SmartContract) AuthenticateUser(ctx contractapi.TransactionContextInterface) (string, error) {
	cn, _ := getCallerCN(ctx)
	role, found, _ := getClientRole(ctx)
	msp, _ := getClientMSP(ctx)

	if !found {
		role = "none"
	}

	return fmt.Sprintf("CN=%s, MSP=%s, role=%s", cn, msp, role), nil
}

// Create Transaction History
func (s *SmartContract) CreateTransactionHistory(
	ctx contractapi.TransactionContextInterface,
	depositUser string, amount string, date string, time string, historyHash string,
) error {

	if depositUser == "" || amount == "" || historyHash == "" {
		return fmt.Errorf("required fields missing")
	}

	_, found, err := getClientRole(ctx)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("caller has no role attribute")
	}

	record := TransactionHistory{
		DepositUser: depositUser,
		Amount:      amount,
		Date:        date,
		Time:        time,
		HistoryHash: historyHash,
	}

	data, _ := json.Marshal(record)
	return ctx.GetStub().PutState(historyHash, data)
}

// ======================== Main ========================

func main() {
	cc, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		fmt.Println("Error creating chaincode:", err)
		return
	}
	if err := cc.Start(); err != nil {
		fmt.Println("Error starting chaincode:", err)
	}
}
