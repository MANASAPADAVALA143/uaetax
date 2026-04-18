"""UAE Tax RAG System using ChromaDB for vector storage and retrieval"""
import os
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional, Any
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()


class UAETaxRAG:
    """UAE Tax Knowledge Base using RAG (Retrieval Augmented Generation)"""
    
    def __init__(self, persist_directory: str = "./rag/chroma_db"):
        """
        Initialize ChromaDB client and create collections for UAE tax knowledge base.
        
        Args:
            persist_directory: Directory to persist ChromaDB data
        """
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Create collections for different tax law categories
        self.collections = {
            "uae_vat_law": self.client.get_or_create_collection(
                name="uae_vat_law",
                metadata={"description": "UAE VAT Decree-Law No. 8 of 2017 and related regulations"}
            ),
            "uae_corporate_tax_law": self.client.get_or_create_collection(
                name="uae_corporate_tax_law",
                metadata={"description": "UAE Corporate Tax Law (Federal Decree-Law No. 47 of 2022)"}
            ),
            "fta_public_clarifications": self.client.get_or_create_collection(
                name="fta_public_clarifications",
                metadata={"description": "FTA public clarifications and guidelines"}
            ),
            "free_zone_regulations": self.client.get_or_create_collection(
                name="free_zone_regulations",
                metadata={"description": "Free zone tax regulations and QFZP rules"}
            )
        }
        
        # Initialize Claude client for reasoning
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_api_key:
            self.claude_client = Anthropic(api_key=anthropic_api_key)
        else:
            self.claude_client = None
            print("Warning: ANTHROPIC_API_KEY not set. Reasoning will be limited.")
        
        # Load tax rules on initialization
        self.load_tax_rules()
    
    def load_tax_rules(self):
        """Load UAE VAT and tax rules as documents into ChromaDB collections"""
        
        # VAT Rules for uae_vat_law collection
        vat_rules = [
            {
                "id": "vat_rule_001",
                "text": "Standard rate 5% applies to most goods and services supplied in the UAE mainland. This includes office supplies, consulting services, software licenses, and general business services.",
                "metadata": {"category": "standard_rate", "rate": "5%", "scope": "mainland"}
            },
            {
                "id": "vat_rule_002",
                "text": "Zero rate applies to exports of goods and services outside the UAE. International transport services are also zero-rated. This includes air, sea, and land transport for international routes.",
                "metadata": {"category": "zero_rate", "rate": "0%", "scope": "exports"}
            },
            {
                "id": "vat_rule_003",
                "text": "Zero rate applies to certain food items as specified in the VAT Executive Regulations. Healthcare services and education services are also zero-rated.",
                "metadata": {"category": "zero_rate", "rate": "0%", "scope": "food_healthcare_education"}
            },
            {
                "id": "vat_rule_004",
                "text": "Zero rate applies to the first supply of residential buildings. This means the first sale or lease of a residential property is zero-rated for VAT purposes.",
                "metadata": {"category": "zero_rate", "rate": "0%", "scope": "residential_first_supply"}
            },
            {
                "id": "vat_rule_005",
                "text": "Exempt supplies include bare land (undeveloped land), local passenger transport services, and financial services that are margin-based (not fee-based).",
                "metadata": {"category": "exempt", "rate": "0%", "scope": "bare_land_transport_financial"}
            },
            {
                "id": "vat_rule_006",
                "text": "Out of scope transactions include salaries and wages paid to employees, dividends paid to shareholders, and sovereign activities of the government.",
                "metadata": {"category": "out_of_scope", "rate": "N/A", "scope": "salaries_dividends_sovereign"}
            },
            {
                "id": "vat_rule_007",
                "text": "Reverse charge mechanism applies to imports of services from abroad where the recipient is the person liable to pay VAT. Certain imports of goods may also be subject to reverse charge.",
                "metadata": {"category": "reverse_charge", "rate": "5%", "scope": "imports_services"}
            },
            {
                "id": "vat_rule_008",
                "text": "Free zone supplies: Supplies between entities within the same designated zone may be outside UAE VAT scope. This depends on the specific free zone designation.",
                "metadata": {"category": "free_zone", "rate": "varies", "scope": "designated_zones"}
            },
            {
                "id": "vat_rule_009",
                "text": "Mainland to free zone supply is treated as a zero-rated export. The supplier in mainland treats this as an export transaction at 0% VAT.",
                "metadata": {"category": "free_zone", "rate": "0%", "scope": "mainland_to_freezone"}
            },
            {
                "id": "vat_rule_010",
                "text": "Free zone to mainland supply is treated as a standard-rated import. The mainland recipient must account for VAT at 5% under reverse charge or the free zone supplier charges 5%.",
                "metadata": {"category": "free_zone", "rate": "5%", "scope": "freezone_to_mainland"}
            },
            {
                "id": "vat_rule_011",
                "text": "Free zone to free zone supply within the same designated zone is typically out of scope for UAE VAT. No VAT is applicable on such transactions.",
                "metadata": {"category": "free_zone", "rate": "out_of_scope", "scope": "freezone_same_zone"}
            },
            {
                "id": "vat_rule_012",
                "text": "Free zone to free zone supply between different designated zones requires checking the specific designated zone status. Each zone may have different VAT treatment rules.",
                "metadata": {"category": "free_zone", "rate": "varies", "scope": "freezone_different_zones"}
            }
        ]
        
        # Corporate Tax Rules for uae_corporate_tax_law collection
        ct_rules = [
            {
                "id": "ct_rule_001",
                "text": "Qualifying Free Zone Person (QFZP) status allows 0% Corporate Tax rate on qualifying income. Qualifying income includes income from transactions with other free zone persons, income from designated activities, and income from immovable property in free zones.",
                "metadata": {"category": "qfzp", "rate": "0%", "scope": "qualifying_income"}
            },
            {
                "id": "ct_rule_002",
                "text": "Non-qualifying income for QFZP entities is taxed at 9% Corporate Tax rate. This includes income from mainland activities, income from natural persons, and income from excluded activities.",
                "metadata": {"category": "qfzp", "rate": "9%", "scope": "non_qualifying_income"}
            },
            {
                "id": "ct_rule_003",
                "text": "Mainland entities are subject to 9% Corporate Tax on taxable income above AED 375,000. Income up to AED 375,000 is taxed at 0%.",
                "metadata": {"category": "mainland_ct", "rate": "9%", "scope": "mainland_entities"}
            }
        ]
        
        # Free Zone Regulations
        freezone_rules = [
            {
                "id": "fz_rule_001",
                "text": "Designated zones are specific free zones approved by the Cabinet. Supplies within the same designated zone are generally outside UAE VAT scope.",
                "metadata": {"category": "designated_zones", "scope": "intra_zone"}
            },
            {
                "id": "fz_rule_002",
                "text": "To qualify as QFZP, an entity must maintain adequate substance in the UAE, derive qualifying income, and comply with transfer pricing requirements.",
                "metadata": {"category": "qfzp_requirements", "scope": "eligibility"}
            }
        ]
        
        # Load rules into collections
        self._load_documents("uae_vat_law", vat_rules)
        self._load_documents("uae_corporate_tax_law", ct_rules)
        self._load_documents("free_zone_regulations", freezone_rules)
        
        print(f"Loaded {len(vat_rules)} VAT rules, {len(ct_rules)} CT rules, and {len(freezone_rules)} free zone rules")
    
    def _load_documents(self, collection_name: str, documents: List[Dict[str, Any]]):
        """
        Load documents into a ChromaDB collection.
        
        Args:
            collection_name: Name of the collection
            documents: List of documents with 'id', 'text', and 'metadata' keys
        """
        collection = self.collections[collection_name]
        
        # Check if documents already exist
        existing_ids = set()
        try:
            existing = collection.get()
            if existing and existing.get("ids"):
                existing_ids = set(existing["ids"])
        except:
            pass
        
        # Filter out documents that already exist
        new_documents = [doc for doc in documents if doc["id"] not in existing_ids]
        
        if new_documents:
            collection.add(
                documents=[doc["text"] for doc in new_documents],
                metadatas=[doc["metadata"] for doc in new_documents],
                ids=[doc["id"] for doc in new_documents]
            )
            print(f"Added {len(new_documents)} new documents to {collection_name}")
    
    def query(self, question: str, collection_name: str = "uae_vat_law", n_results: int = 3) -> List[Dict[str, Any]]:
        """
        Perform semantic search on a collection and return relevant rules.
        
        Args:
            question: The question or query text
            collection_name: Name of the collection to search (default: uae_vat_law)
            n_results: Number of results to return (default: 3)
        
        Returns:
            List of dictionaries containing relevant rules with text, metadata, and distance
        """
        if collection_name not in self.collections:
            raise ValueError(f"Collection '{collection_name}' not found. Available: {list(self.collections.keys())}")
        
        collection = self.collections[collection_name]
        
        try:
            results = collection.query(
                query_texts=[question],
                n_results=n_results
            )
            
            # Format results
            formatted_results = []
            if results["documents"] and len(results["documents"]) > 0:
                for i in range(len(results["documents"][0])):
                    formatted_results.append({
                        "text": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                        "distance": results["distances"][0][i] if results["distances"] else None,
                        "id": results["ids"][0][i] if results["ids"] else None
                    })
            
            return formatted_results
        except Exception as e:
            print(f"Error querying collection: {e}")
            return []
    
    def get_vat_treatment(
        self, 
        transaction_description: str, 
        entity_type: str = "mainland",
        amount: Optional[float] = None,
        vendor_location: Optional[str] = None,
        customer_location: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get recommended VAT treatment for a transaction using RAG.
        
        Args:
            transaction_description: Description of the transaction
            entity_type: Type of entity (mainland, free_zone, designated_zone)
            amount: Transaction amount in AED (optional)
            vendor_location: Location of vendor (optional)
            customer_location: Location of customer (optional)
        
        Returns:
            Dictionary with recommended VAT treatment, reasoning, and confidence
        """
        # Build query from transaction details
        query_parts = [transaction_description]
        if entity_type:
            query_parts.append(f"entity type: {entity_type}")
        if vendor_location:
            query_parts.append(f"vendor in {vendor_location}")
        if customer_location:
            query_parts.append(f"customer in {customer_location}")
        
        query = " ".join(query_parts)
        
        # Query relevant VAT rules
        vat_rules = self.query(query, collection_name="uae_vat_law", n_results=3)
        
        # Query free zone rules if applicable
        freezone_rules = []
        if entity_type in ["free_zone", "designated_zone"]:
            freezone_rules = self.query(query, collection_name="free_zone_regulations", n_results=2)
        
        # Combine all relevant rules
        all_rules = vat_rules + freezone_rules
        
        # Build context for reasoning
        context = "\n\n".join([
            f"Rule {i+1}: {rule['text']} (Category: {rule['metadata'].get('category', 'N/A')})"
            for i, rule in enumerate(all_rules)
        ])
        
        # Use Claude for reasoning if available
        if self.claude_client and all_rules:
            reasoning_prompt = f"""You are a UAE VAT expert. Based on the following UAE VAT rules, determine the VAT treatment for this transaction.

Transaction Details:
- Description: {transaction_description}
- Entity Type: {entity_type}
- Amount: {amount if amount else 'Not specified'} AED
- Vendor Location: {vendor_location if vendor_location else 'Not specified'}
- Customer Location: {customer_location if customer_location else 'Not specified'}

Relevant UAE VAT Rules:
{context}

Provide:
1. Recommended VAT treatment (standard_rated, zero_rated, exempt, out_of_scope, or reverse_charge)
2. VAT rate (5%, 0%, or N/A)
3. Brief reasoning (2-3 sentences)
4. Confidence level (high, medium, or low)

Return your response in this format:
VAT_TREATMENT: [treatment]
VAT_RATE: [rate]
REASONING: [your reasoning]
CONFIDENCE: [high/medium/low]"""

            try:
                message = self.claude_client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=500,
                    temperature=0.1,
                    messages=[{"role": "user", "content": reasoning_prompt}]
                )
                
                reasoning_text = message.content[0].text
                
                # Parse response
                treatment = "standard_rated"  # default
                rate = "5%"
                reasoning = reasoning_text
                confidence = "medium"
                
                for line in reasoning_text.split("\n"):
                    if "VAT_TREATMENT:" in line.upper():
                        treatment = line.split(":")[-1].strip().lower().replace(" ", "_")
                    elif "VAT_RATE:" in line.upper():
                        rate = line.split(":")[-1].strip()
                    elif "CONFIDENCE:" in line.upper():
                        confidence = line.split(":")[-1].strip().lower()
                
                return {
                    "vat_treatment": treatment,
                    "vat_rate": rate,
                    "reasoning": reasoning,
                    "confidence": confidence,
                    "relevant_rules": all_rules,
                    "method": "rag_with_claude"
                }
            except Exception as e:
                print(f"Error with Claude reasoning: {e}")
        
        # Fallback: Simple rule-based classification
        if not all_rules:
            return {
                "vat_treatment": "standard_rated",
                "vat_rate": "5%",
                "reasoning": "No specific rules found. Defaulting to standard rate.",
                "confidence": "low",
                "relevant_rules": [],
                "method": "fallback"
            }
        
        # Simple rule matching
        description_lower = transaction_description.lower()
        treatment = "standard_rated"
        rate = "5%"
        reasoning_parts = []
        
        # Check for zero-rated indicators
        if any(word in description_lower for word in ["export", "international transport", "medicine", "healthcare", "education", "residential"]):
            treatment = "zero_rated"
            rate = "0%"
            reasoning_parts.append("Transaction appears to be zero-rated based on UAE VAT rules.")
        
        # Check for exempt indicators
        elif any(word in description_lower for word in ["bare land", "local transport", "financial service"]):
            treatment = "exempt"
            rate = "0%"
            reasoning_parts.append("Transaction appears to be exempt from VAT.")
        
        # Check for out of scope
        elif any(word in description_lower for word in ["salary", "wage", "dividend"]):
            treatment = "out_of_scope"
            rate = "N/A"
            reasoning_parts.append("Transaction is out of scope for VAT.")
        
        # Check for reverse charge
        elif vendor_location and vendor_location.lower() not in ["uae", "mainland", "free zone"]:
            treatment = "reverse_charge"
            rate = "5%"
            reasoning_parts.append("Service from outside UAE may be subject to reverse charge.")
        
        else:
            reasoning_parts.append("Standard rated supply at 5% applies to most goods and services in UAE mainland.")
        
        reasoning_parts.append(f"Based on relevant rule: {all_rules[0]['text'][:100]}...")
        
        return {
            "vat_treatment": treatment,
            "vat_rate": rate,
            "reasoning": " ".join(reasoning_parts),
            "confidence": "medium",
            "relevant_rules": all_rules,
            "method": "rag_rule_based"
        }


# Convenience function for easy import
def get_rag_instance() -> UAETaxRAG:
    """Get or create a UAETaxRAG instance"""
    return UAETaxRAG()
