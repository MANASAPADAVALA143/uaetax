"""Test script for UAE Tax RAG system"""
from uae_tax_rag import UAETaxRAG


def test_rag_system():
    """Test the RAG system with sample queries"""
    print("=" * 60)
    print("UAE Tax RAG System Test")
    print("=" * 60)
    
    # Initialize RAG
    print("\n1. Initializing RAG system...")
    rag = UAETaxRAG()
    print("✓ RAG system initialized")
    
    # Test 1: Query VAT rules
    print("\n2. Testing semantic search...")
    print("\nQuery: 'What is the VAT rate for exports?'")
    results = rag.query("What is the VAT rate for exports?", collection_name="uae_vat_law", n_results=3)
    for i, result in enumerate(results, 1):
        print(f"\n  Result {i}:")
        print(f"  Text: {result['text'][:150]}...")
        print(f"  Category: {result['metadata'].get('category', 'N/A')}")
        print(f"  Distance: {result['distance']:.4f}" if result['distance'] else "  Distance: N/A")
    
    # Test 2: Get VAT treatment - Export
    print("\n3. Testing VAT treatment recommendation...")
    print("\nTransaction: Export of goods to Saudi Arabia")
    treatment = rag.get_vat_treatment(
        transaction_description="Export of goods to Saudi Arabia",
        entity_type="mainland",
        amount=100000.0,
        vendor_location="mainland",
        customer_location="Saudi Arabia"
    )
    print(f"\n  VAT Treatment: {treatment['vat_treatment']}")
    print(f"  VAT Rate: {treatment['vat_rate']}")
    print(f"  Confidence: {treatment['confidence']}")
    print(f"  Method: {treatment['method']}")
    print(f"\n  Reasoning:\n  {treatment['reasoning']}")
    
    # Test 3: Get VAT treatment - Office supplies
    print("\n4. Testing VAT treatment - Office supplies...")
    print("\nTransaction: Office furniture supply in Dubai")
    treatment = rag.get_vat_treatment(
        transaction_description="Office furniture supply in Dubai",
        entity_type="mainland",
        amount=52500.0,
        vendor_location="mainland",
        customer_location="mainland"
    )
    print(f"\n  VAT Treatment: {treatment['vat_treatment']}")
    print(f"  VAT Rate: {treatment['vat_rate']}")
    print(f"  Confidence: {treatment['confidence']}")
    
    # Test 4: Free zone transaction
    print("\n5. Testing VAT treatment - Free zone transaction...")
    print("\nTransaction: Software license from free zone to mainland")
    treatment = rag.get_vat_treatment(
        transaction_description="Software license supply",
        entity_type="free_zone",
        amount=50000.0,
        vendor_location="free_zone",
        customer_location="mainland"
    )
    print(f"\n  VAT Treatment: {treatment['vat_treatment']}")
    print(f"  VAT Rate: {treatment['vat_rate']}")
    print(f"  Confidence: {treatment['confidence']}")
    
    # Test 5: Query free zone regulations
    print("\n6. Testing free zone regulations query...")
    results = rag.query("What are the QFZP requirements?", collection_name="free_zone_regulations", n_results=2)
    for i, result in enumerate(results, 1):
        print(f"\n  Result {i}:")
        print(f"  Text: {result['text']}")
        print(f"  Category: {result['metadata'].get('category', 'N/A')}")
    
    print("\n" + "=" * 60)
    print("Test completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    test_rag_system()
