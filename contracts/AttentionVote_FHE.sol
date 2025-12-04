// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AttentionVote_FHE is SepoliaConfig {
    struct Member {
        euint32 encryptedActivityScore;  // Encrypted activity score
        euint32 encryptedVotingWeight;    // Encrypted voting power
        uint256 lastActive;
        bool isActive;
    }

    struct Proposal {
        euint32 encryptedVoteCount;
        uint256 endTime;
        bool isExecuted;
    }

    uint256 public proposalCount;
    mapping(address => Member) public members;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => ebool)) public encryptedVotes;
    
    mapping(uint256 => uint256) private requestToProposalId;
    mapping(address => uint256) private requestToMemberId;
    
    event MemberJoined(address indexed member);
    event ProposalCreated(uint256 indexed proposalId, uint256 endTime);
    event VoteCast(address indexed voter, uint256 proposalId);
    event ProposalExecuted(uint256 indexed proposalId);
    event DecryptionRequested(uint256 indexed id);
    
    modifier onlyMember() {
        require(members[msg.sender].isActive, "Not a member");
        _;
    }

    function joinDAO(euint32 encryptedInitialScore) public {
        require(!members[msg.sender].isActive, "Already member");
        
        members[msg.sender] = Member({
            encryptedActivityScore: encryptedInitialScore,
            encryptedVotingWeight: FHE.asEuint32(0),
            lastActive: block.timestamp,
            isActive: true
        });
        
        emit MemberJoined(msg.sender);
    }

    function createProposal(uint256 duration) public onlyMember {
        proposalCount++;
        proposals[proposalCount] = Proposal({
            encryptedVoteCount: FHE.asEuint32(0),
            endTime: block.timestamp + duration,
            isExecuted: false
        });
        
        updateActivityScore(msg.sender);
        emit ProposalCreated(proposalCount, block.timestamp + duration);
    }

    function castVote(uint256 proposalId, ebool encryptedVote) public onlyMember {
        require(block.timestamp <= proposals[proposalId].endTime, "Voting ended");
        require(!proposals[proposalId].isExecuted, "Proposal executed");
        
        encryptedVotes[proposalId][msg.sender] = encryptedVote;
        
        euint32 voteWeight = members[msg.sender].encryptedVotingWeight;
        proposals[proposalId].encryptedVoteCount = FHE.add(
            proposals[proposalId].encryptedVoteCount,
            FHE.mul(FHE.asEuint32(encryptedVote), voteWeight)
        );
        
        updateActivityScore(msg.sender);
        emit VoteCast(msg.sender, proposalId);
    }

    function executeProposal(uint256 proposalId) public onlyMember {
        require(block.timestamp > proposals[proposalId].endTime, "Voting ongoing");
        require(!proposals[proposalId].isExecuted, "Already executed");
        
        proposals[proposalId].isExecuted = true;
        emit ProposalExecuted(proposalId);
    }

    function updateActivityScore(address member) private {
        euint32 timeSinceActive = FHE.asEuint32(uint32(block.timestamp - members[member].lastActive));
        members[member].encryptedActivityScore = FHE.add(
            members[member].encryptedActivityScore,
            FHE.div(timeSinceActive, FHE.asEuint32(3600)) // 1 point per hour
        );
        
        // Voting weight = sqrt(activity score)
        members[member].encryptedVotingWeight = FHE.sqrt(members[member].encryptedActivityScore);
        members[member].lastActive = block.timestamp;
    }

    function requestVoteCountDecryption(uint256 proposalId) public onlyMember {
        Proposal storage proposal = proposals[proposalId];
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(proposal.encryptedVoteCount);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptVoteCount.selector);
        requestToProposalId[reqId] = proposalId;
        
        emit DecryptionRequested(proposalId);
    }

    function decryptVoteCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 proposalId = requestToProposalId[requestId];
        require(proposalId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 voteCount = abi.decode(cleartexts, (uint32));
        // Handle decrypted vote count
    }

    function requestMemberDataDecryption() public onlyMember {
        Member storage member = members[msg.sender];
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(member.encryptedActivityScore);
        ciphertexts[1] = FHE.toBytes32(member.encryptedVotingWeight);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptMemberData.selector);
        requestToMemberId[msg.sender] = reqId;
    }

    function decryptMemberData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        address member = msg.sender;
        require(requestToMemberId[member] == requestId, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory memberData = abi.decode(cleartexts, (uint32[]));
        // Handle decrypted member data
    }

    function getProposalStatus(uint256 proposalId) public view returns (bool, bool) {
        return (
            block.timestamp > proposals[proposalId].endTime,
            proposals[proposalId].isExecuted
        );
    }

    function calculateQuorum(uint256 proposalId) public view returns (ebool) {
        euint32 totalWeight = FHE.asEuint32(0);
        uint256 memberCount = 0;
        
        // This would require iterating through all members in a real implementation
        // Simplified for demonstration
        return FHE.gt(
            proposals[proposalId].encryptedVoteCount, 
            FHE.div(totalWeight, FHE.asEuint32(2))
        );
    }
}