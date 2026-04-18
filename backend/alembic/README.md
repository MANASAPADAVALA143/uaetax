# Alembic Migrations

This directory contains database migration scripts for GulfTax AI.

## Setup

Migrations are already configured. The `env.py` file automatically reads the `DATABASE_URL` from your `.env` file.

## Running Migrations

### Initial Setup

If this is the first time setting up the database:

```bash
cd backend

# Make sure your .env file has DATABASE_URL set
# Then run the initial migration
alembic upgrade head
```

### Creating New Migrations

After modifying models in `models.py`:

```bash
cd backend

# Generate a new migration
alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file in alembic/versions/

# Apply the migration
alembic upgrade head
```

### Migration Commands

```bash
# Show current revision
alembic current

# Show migration history
alembic history

# Upgrade to latest
alembic upgrade head

# Downgrade one revision
alembic downgrade -1

# Downgrade to specific revision
alembic downgrade <revision_id>

# Show SQL for a migration (without applying)
alembic upgrade head --sql
```

## Migration Files

- `001_initial_migration.py` - Creates all initial tables:
  - companies
  - transactions
  - vat_returns
  - reconciliation_results

## Troubleshooting

**Migration fails:**
- Check that PostgreSQL is running
- Verify DATABASE_URL in `.env` is correct
- Ensure database exists: `createdb gulftax_ai`

**Models not detected:**
- Make sure all models are imported in `alembic/env.py`
- Check that models inherit from `Base`

**Migration conflicts:**
- Check current revision: `alembic current`
- Review migration history: `alembic history`
- If needed, manually edit migration files before applying
