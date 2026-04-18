# UAE Tax RAG System

Retrieval Augmented Generation (RAG) system for UAE tax law using ChromaDB vector store.

## Overview

The `UAETaxRAG` class provides semantic search over UAE tax regulations and automated VAT treatment recommendations.

## Features

- **4 ChromaDB Collections:**
  - `uae_vat_law` - VAT Decree-Law No. 8 of 2017 rules
  - `uae_corporate_tax_law` - Corporate Tax Law rules
  - `fta_public_clarifications` - FTA guidelines
  - `free_zone_regulations` - Free zone and QFZP rules

- **Semantic Search:** Query relevant tax rules using natural language
- **VAT Treatment Recommendations:** Get AI-powered VAT classification with reasoning

## Usage

### Basic Usage

```python
from rag.uae_tax_rag import UAETaxRAG

# Initialize RAG system
rag = UAETaxRAG()

# Query relevant rules
results = rag.query("What is the VAT rate for exports?", collection_name="uae_vat_law", n_results=3)
for result in results:
    print(result["text"])
    print(result["metadata"])

# Get VAT treatment recommendation
treatment = rag.get_vat_treatment(
    transaction_description="Export of goods to Saudi Arabia",
    entity_type="mainland",
    amount=100000.0,
    vendor_location="mainland",
    customer_location="Saudi Arabia"
)

print(f"Treatment: {treatment['vat_treatment']}")
print(f"Rate: {treatment['vat_rate']}")
print(f"Reasoning: {treatment['reasoning']}")
```

### Integration with Backend

```python
# In backend/main.py or a service file
from rag.uae_tax_rag import UAETaxRAG

rag = UAETaxRAG()

# Use in VAT classification
def classify_with_rag(transaction):
    result = rag.get_vat_treatment(
        transaction_description=transaction["description"],
        entity_type=transaction.get("entity_type", "mainland"),
        amount=float(transaction["amount"])
    )
    return result
```

## Collections

### uae_vat_law
Contains 12 core VAT rules covering:
- Standard rate (5%)
- Zero-rated supplies (exports, healthcare, education, etc.)
- Exempt supplies (bare land, local transport, financial services)
- Out of scope (salaries, dividends)
- Reverse charge
- Free zone rules

### uae_corporate_tax_law
Contains Corporate Tax rules:
- QFZP qualifying income (0%)
- Non-qualifying income (9%)
- Mainland CT rates

### free_zone_regulations
Contains free zone specific rules:
- Designated zones
- QFZP requirements
- Inter-zone transactions

### fta_public_clarifications
(Ready for FTA clarifications to be added)

## Methods

### `query(question, collection_name, n_results=3)`
Perform semantic search on a collection.

**Parameters:**
- `question` (str): Query text
- `collection_name` (str): Collection to search
- `n_results` (int): Number of results (default: 3)

**Returns:** List of relevant rules with text, metadata, and distance scores

### `get_vat_treatment(transaction_description, entity_type, amount, ...)`
Get recommended VAT treatment with reasoning.

**Parameters:**
- `transaction_description` (str): Transaction description
- `entity_type` (str): mainland, free_zone, or designated_zone
- `amount` (float, optional): Transaction amount
- `vendor_location` (str, optional): Vendor location
- `customer_location` (str, optional): Customer location

**Returns:** Dictionary with:
- `vat_treatment`: standard_rated, zero_rated, exempt, out_of_scope, or reverse_charge
- `vat_rate`: 5%, 0%, or N/A
- `reasoning`: Explanation
- `confidence`: high, medium, or low
- `relevant_rules`: List of rules used
- `method`: rag_with_claude or rag_rule_based

## Adding New Rules

To add new rules, modify the `load_tax_rules()` method in `uae_tax_rag.py`:

```python
new_rules = [
    {
        "id": "vat_rule_013",
        "text": "Your new rule text here...",
        "metadata": {"category": "your_category", "rate": "5%", "scope": "your_scope"}
    }
]
self._load_documents("uae_vat_law", new_rules)
```

## Requirements

- `chromadb` - Vector database
- `anthropic` - For Claude API reasoning (optional, falls back to rule-based if not available)
- `python-dotenv` - For environment variables

## Data Persistence

ChromaDB data is persisted in `./rag/chroma_db/` directory. This allows the vector store to persist between sessions.

## Environment Variables

- `ANTHROPIC_API_KEY` - Optional, for enhanced reasoning with Claude API
