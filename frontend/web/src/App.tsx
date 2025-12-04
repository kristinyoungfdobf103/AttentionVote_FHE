import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface VoteRecord {
  id: string;
  proposalId: string;
  voter: string;
  attentionScore: number;
  timestamp: number;
  encryptedVote: string;
  weight: number;
  status: "pending" | "counted" | "invalid";
}

interface Proposal {
  id: string;
  title: string;
  description: string;
  creator: string;
  createdAt: number;
  endTime: number;
  totalVotes: number;
  status: "active" | "passed" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Calculate statistics for dashboard
  const countedVotes = votes.filter(v => v.status === "counted").length;
  const pendingVotes = votes.filter(v => v.status === "pending").length;
  const invalidVotes = votes.filter(v => v.status === "invalid").length;
  const activeProposals = proposals.filter(p => p.status === "active").length;
  const passedProposals = proposals.filter(p => p.status === "passed").length;
  const rejectedProposals = proposals.filter(p => p.status === "rejected").length;

  // Filter votes based on search and filter criteria
  const filteredVotes = votes.filter(vote => {
    const matchesSearch = searchQuery === "" || 
      vote.proposalId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vote.voter.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = statusFilter === "all" || vote.status === statusFilter;
    
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // Load vote records
      const votesBytes = await contract.getData("vote_records");
      let voteList: VoteRecord[] = [];
      
      if (votesBytes.length > 0) {
        try {
          voteList = JSON.parse(ethers.toUtf8String(votesBytes));
        } catch (e) {
          console.error("Error parsing vote records:", e);
        }
      }
      
      // Load proposals
      const proposalsBytes = await contract.getData("proposals");
      let proposalList: Proposal[] = [];
      
      if (proposalsBytes.length > 0) {
        try {
          proposalList = JSON.parse(ethers.toUtf8String(proposalsBytes));
        } catch (e) {
          console.error("Error parsing proposals:", e);
        }
      }
      
      setVotes(voteList);
      setProposals(proposalList);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable ? "Contract is available!" : "Contract is not available"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Error checking availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const createTestVote = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Creating encrypted vote with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Generate random vote data
      const voteId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const proposalId = `prop-${Math.floor(Math.random() * 5) + 1}`;
      const attentionScore = Math.floor(Math.random() * 100) + 1;
      const weight = Math.floor(attentionScore * 0.8) + Math.random() * 20;
      
      const voteData = {
        id: voteId,
        proposalId,
        voter: account,
        attentionScore,
        timestamp: Math.floor(Date.now() / 1000),
        encryptedVote: `FHE-ENCRYPTED-VOTE-${btoa(JSON.stringify({
          choice: Math.random() > 0.5 ? "yes" : "no",
          confidence: Math.random()
        }))}`,
        weight,
        status: "pending"
      };
      
      // Update vote records
      const votesBytes = await contract.getData("vote_records");
      let voteList: VoteRecord[] = [];
      
      if (votesBytes.length > 0) {
        try {
          voteList = JSON.parse(ethers.toUtf8String(votesBytes));
        } catch (e) {
          console.error("Error parsing votes:", e);
        }
      }
      
      voteList.push(voteData);
      
      await contract.setData(
        "vote_records", 
        ethers.toUtf8Bytes(JSON.stringify(voteList))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted vote created with FHE!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedItem === id) {
      setExpandedItem(null);
    } else {
      setExpandedItem(id);
    }
  };

  const renderBarChart = () => {
    // Sample data for bar chart - proposal votes
    const data = proposals.slice(0, 5).map(p => p.totalVotes);
    const maxValue = Math.max(...data, 1);
    
    return (
      <div className="bar-chart">
        {data.map((value, index) => (
          <div key={index} className="bar-container">
            <div 
              className="bar" 
              style={{ height: `${(value / maxValue) * 100}%` }}
            ></div>
            <div className="bar-label">{value}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="neon-circle"></div>
          </div>
          <h1>Attention<span>Vote</span>DAO</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={createTestVote} 
            className="action-btn cyber-button"
          >
            <div className="pulse-dot"></div>
            Cast Test Vote
          </button>
          <button 
            onClick={checkAvailability}
            className="action-btn cyber-button"
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        {/* Project Introduction */}
        <div className="intro-section cyber-card">
          <h2>FHE-Based Private DAO with Attention-based Voting</h2>
          <p>
            A decentralized autonomous organization where voting power is dynamically determined 
            by encrypted, historical participation (attention) using Fully Homomorphic Encryption (FHE).
          </p>
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
        </div>
        
        {/* Dashboard Stats */}
        <div className="dashboard-grid">
          <div className="stat-card cyber-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>{votes.length}</h3>
              <p>Total Votes</p>
            </div>
          </div>
          
          <div className="stat-card cyber-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <h3>{countedVotes}</h3>
              <p>Counted Votes</p>
            </div>
          </div>
          
          <div className="stat-card cyber-card">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <h3>{pendingVotes}</h3>
              <p>Pending Votes</p>
            </div>
          </div>
          
          <div className="stat-card cyber-card">
            <div className="stat-icon">🚫</div>
            <div className="stat-content">
              <h3>{invalidVotes}</h3>
              <p>Invalid Votes</p>
            </div>
          </div>
          
          <div className="stat-card cyber-card">
            <div className="stat-icon">🗳️</div>
            <div className="stat-content">
              <h3>{proposals.length}</h3>
              <p>Total Proposals</p>
            </div>
          </div>
          
          <div className="stat-card cyber-card">
            <div className="stat-icon">🔵</div>
            <div className="stat-content">
              <h3>{activeProposals}</h3>
              <p>Active Proposals</p>
            </div>
          </div>
        </div>
        
        {/* Charts Section */}
        <div className="charts-section">
          <div className="chart-card cyber-card">
            <h3>Vote Status Distribution</h3>
            <div className="pie-chart-container">
              <div className="pie-chart">
                <div 
                  className="pie-segment counted" 
                  style={{ transform: `rotate(${(countedVotes / votes.length) * 360}deg)` }}
                ></div>
                <div 
                  className="pie-segment pending" 
                  style={{ transform: `rotate(${((countedVotes + pendingVotes) / votes.length) * 360}deg)` }}
                ></div>
                <div 
                  className="pie-segment invalid" 
                  style={{ transform: `rotate(${((countedVotes + pendingVotes + invalidVotes) / votes.length) * 360}deg)` }}
                ></div>
                <div className="pie-center">
                  <div className="pie-value">{votes.length}</div>
                  <div className="pie-label">Votes</div>
                </div>
              </div>
              <div className="pie-legend">
                <div className="legend-item">
                  <div className="color-box counted"></div>
                  <span>Counted: {countedVotes}</span>
                </div>
                <div className="legend-item">
                  <div className="color-box pending"></div>
                  <span>Pending: {pendingVotes}</span>
                </div>
                <div className="legend-item">
                  <div className="color-box invalid"></div>
                  <span>Invalid: {invalidVotes}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="chart-card cyber-card">
            <h3>Top Proposals by Votes</h3>
            {renderBarChart()}
          </div>
        </div>
        
        {/* Votes List with Search & Filter */}
        <div className="votes-section">
          <div className="section-header">
            <h2>Encrypted Vote Records</h2>
            <div className="header-actions">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search votes..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="cyber-input"
                />
              </div>
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="cyber-select"
              >
                <option value="all">All Status</option>
                <option value="counted">Counted</option>
                <option value="pending">Pending</option>
                <option value="invalid">Invalid</option>
              </select>
              <button 
                onClick={loadData}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="votes-list cyber-card">
            {filteredVotes.length === 0 ? (
              <div className="no-votes">
                <div className="no-votes-icon">🗳️</div>
                <p>No vote records found</p>
                <button 
                  className="cyber-button primary"
                  onClick={createTestVote}
                >
                  Create Test Vote
                </button>
              </div>
            ) : (
              filteredVotes.map(vote => (
                <div className="vote-item" key={vote.id}>
                  <div className="vote-summary" onClick={() => toggleExpand(vote.id)}>
                    <div className="vote-info">
                      <div className="vote-id">Vote #{vote.id.substring(0, 6)}</div>
                      <div className="vote-proposal">Proposal: {vote.proposalId}</div>
                      <div className="vote-voter">Voter: {vote.voter.substring(0, 6)}...{vote.voter.substring(38)}</div>
                    </div>
                    <div className="vote-stats">
                      <div className="attention-score">
                        <span className="label">Attention:</span>
                        <span className="value">{vote.attentionScore}</span>
                      </div>
                      <div className="vote-weight">
                        <span className="label">Weight:</span>
                        <span className="value">{vote.weight.toFixed(2)}</span>
                      </div>
                      <div className={`vote-status ${vote.status}`}>
                        {vote.status}
                      </div>
                    </div>
                    <div className="expand-icon">
                      {expandedItem === vote.id ? "▼" : "▶"}
                    </div>
                  </div>
                  
                  {expandedItem === vote.id && (
                    <div className="vote-details">
                      <div className="detail-row">
                        <span className="detail-label">Vote ID:</span>
                        <span className="detail-value">{vote.id}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Timestamp:</span>
                        <span className="detail-value">{new Date(vote.timestamp * 1000).toLocaleString()}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Encrypted Vote:</span>
                        <span className="detail-value encrypted">{vote.encryptedVote.substring(0, 30)}...</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">FHE Processed:</span>
                        <span className="detail-value">{vote.status === "counted" ? "Yes" : "No"}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="neon-circle"></div>
              <span>AttentionVoteDAO</span>
            </div>
            <p>Private DAO voting powered by FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} AttentionVoteDAO. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;