"""VAT Classification Service with RAG integration"""
from typing import Dict, Any, Optional
import sys
import os

# Add parent directory to path to import RAG
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from rag.uae_tax_rag import UAETaxRAG
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False
    print("Warning: RAG system not available. Using Claude-only classification.")


class VATClassifierService:
    """Service for VAT transaction classification with RAG support"""
    
    def __init__(self):
        """Initialize the classifier service"""
        self.rag = UAETaxRAG() if RAG_AVAILABLE else None
    
    def classify_transaction(
        self,
        transaction: Dict[str, Any],
        company_entity_type: str = "mainland"
    ) -> Dict[str, Any]:
        """
        Classify a transaction using RAG + Claude API.
        
        Args:
            transaction: Transaction dict with description, vendor, amount
            company_entity_type: Entity type of the company (mainland, free_zone, etc.)
        
        Returns:
            Classification result with VAT treatment, reasoning, and confidence
        """
        description = transaction.get("description", "")
        vendor = transaction.get("vendor", "")
        amount = transaction.get("amount", "")
        
        # Use RAG to get relevant rules and initial treatment
        if self.rag:
            try:
                rag_result = self.rag.get_vat_treatment(
                    transaction_description=description,
                    entity_type=company_entity_type,
                    amount=float(amount) if amount else None,
                    vendor_location=vendor if vendor else None
                )
                
                # Use RAG result as context for Claude
                rag_context = f"""
Relevant UAE VAT Rules from Knowledge Base:
{rag_result.get('reasoning', '')}

RAG Recommendation: {rag_result.get('vat_treatment', 'standard_rated')} at {rag_result.get('vat_rate', '5%')}
RAG Confidence: {rag_result.get('confidence', 'medium')}
"""
            except Exception as e:
                print(f"RAG error: {e}")
                rag_context = ""
        else:
            rag_context = ""
        
        # Enhanced classification result
        result = {
            "description": description,
            "vendor": vendor,
            "amount": str(amount),
            "vat_treatment": "standard_rated",
            "confidence": 95,
            "reasoning": "Classification using AI",
            "rag_used": self.rag is not None
        }
        
        if self.rag and rag_context:
            result["vat_treatment"] = rag_result.get("vat_treatment", "standard_rated")
            result["confidence"] = 95 if rag_result.get("confidence") == "high" else 85
            result["reasoning"] = rag_result.get("reasoning", "")
            result["rag_recommendation"] = rag_result.get("vat_treatment")
        
        return result
