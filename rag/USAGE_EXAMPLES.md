# UAE Tax RAG System - Usage Examples

## Quick Start

```python
from rag.uae_tax_rag import UAETaxRAG

# Initialize
rag = UAETaxRAG()

# Get VAT treatment
result = rag.get_vat_treatment(
    transaction_description="Export of goods to Saudi Arabia",
    entity_type="mainland"
)

print(result["vat_treatment"])  # zero_rated
print(result["vat_rate"])        # 0%
```

## Example 1: Export Transaction

```python
rag = UAETaxRAG()

treatment = rag.get_vat_treatment(
    transaction_description="Export of electronic goods to Saudi Arabia",
    entity_type="mainland",
    amount=150000.0,
    vendor_location="mainland",
    customer_location="Saudi Arabia"
)

# Result:
# {
#   "vat_treatment": "zero_rated",
#   "vat_rate": "0%",
#   "reasoning": "Exports are zero-rated under UAE VAT rules...",
#   "confidence": "high",
#   "method": "rag_with_claude"
# }
```

## Example 2: Office Supplies (Standard Rated)

```python
treatment = rag.get_vat_treatment(
    transaction_description="Office furniture supply",
    entity_type="mainland",
    amount=52500.0,
    vendor_location="mainland",
    customer_location="mainland"
)

# Result:
# {
#   "vat_treatment": "standard_rated",
#   "vat_rate": "5%",
#   "reasoning": "Standard rated supply at 5% applies...",
#   "confidence": "high"
# }
```

## Example 3: Free Zone to Mainland

```python
treatment = rag.get_vat_treatment(
    transaction_description="Software license supply",
    entity_type="free_zone",
    amount=50000.0,
    vendor_location="free_zone",
    customer_location="mainland"
)

# Result:
# {
#   "vat_treatment": "standard_rated",
#   "vat_rate": "5%",
#   "reasoning": "Free zone to mainland supply is standard-rated...",
#   "confidence": "high"
# }
```

## Example 4: Query Specific Rules

```python
# Query VAT rules
results = rag.query(
    "What is the VAT treatment for healthcare services?",
    collection_name="uae_vat_law",
    n_results=3
)

for result in results:
    print(f"Rule: {result['text']}")
    print(f"Category: {result['metadata']['category']}")
    print(f"Distance: {result['distance']}")
    print()
```

## Example 5: Corporate Tax Query

```python
# Query Corporate Tax rules
results = rag.query(
    "What is the tax rate for QFZP qualifying income?",
    collection_name="uae_corporate_tax_law",
    n_results=2
)
```

## Example 6: Free Zone Regulations

```python
# Query free zone rules
results = rag.query(
    "What are the requirements for QFZP status?",
    collection_name="free_zone_regulations",
    n_results=2
)
```

## Integration with Backend API

```python
# In your FastAPI endpoint
from rag.uae_tax_rag import UAETaxRAG

rag = UAETaxRAG()

@app.post("/api/vat/classify-with-rag")
async def classify_with_rag(transaction: dict):
    # Get company entity type from database
    company = db.query(Company).filter(Company.id == transaction["company_id"]).first()
    
    # Use RAG for classification
    result = rag.get_vat_treatment(
        transaction_description=transaction["description"],
        entity_type=company.entity_type,
        amount=transaction["amount"]
    )
    
    return result
```

## Testing

Run the test script:

```bash
cd rag
python test_rag.py
```

This will test:
- RAG initialization
- Semantic search
- VAT treatment recommendations
- Free zone rules
- Multiple transaction types
