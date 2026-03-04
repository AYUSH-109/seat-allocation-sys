"""
Schema Parser - Extracts database schema information using SQLAlchemy
"""
from sqlalchemy import inspect, MetaData, create_engine, text
from typing import Dict, List, Any, Tuple


class SchemaParser:
    """Parse and extract database schema information"""
    
    def __init__(self, db_path: str):
        """
        Initialize schema parser with database connection
        Args:
            db_path: Path to the database file
        """
        # Use sqlite:/// for SQLite databases
        connection_string = f"sqlite:///{db_path}"
        self.engine = create_engine(connection_string)
        self.metadata = MetaData()
        self.inspector = inspect(self.engine)
    
    def get_all_tables(self) -> List[str]:
        """Get all table names from the database"""
        return self.inspector.get_table_names()
    
    def get_table_columns(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Get column information for a specific table
        Returns list of dicts with column details
        """
        columns = self.inspector.get_columns(table_name)
        result = []
        
        for col in columns:
            col_info = {
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col.get("nullable", True),
                "default": col.get("default"),
            }
            result.append(col_info)
        
        return result
    
    def get_primary_keys(self, table_name: str) -> List[str]:
        """Get primary key columns for a table"""
        pk = self.inspector.get_pk_constraint(table_name)
        return pk.get("constrained_columns", []) if pk else []
    
    def get_foreign_keys(self, table_name: str) -> List[Dict[str, Any]]:
        """
        Get foreign key relationships for a table
        Returns list of FK info with source and target tables/columns
        """
        fks = self.inspector.get_foreign_keys(table_name)
        result = []
        
        for fk in fks:
            fk_info = {
                "source_table": table_name,
                "source_columns": fk.get("constrained_columns", []),
                "target_table": fk.get("referred_table", ""),
                "target_columns": fk.get("referred_columns", []),
                "name": fk.get("name", ""),
            }
            result.append(fk_info)
        
        return result
    
    def get_complete_schema(self) -> Dict[str, Any]:
        """
        Get complete schema information for visualization
        Includes all tables, columns, PKs, FKs, and row counts
        """
        tables = self.get_all_tables()
        schema = {
            "tables": [],
            "relationships": []
        }
        
        # Build table nodes
        for table_name in tables:
            columns = self.get_table_columns(table_name)
            pks = self.get_primary_keys(table_name)
            row_count = self.get_table_row_count(table_name)
            
            table_info = {
                "id": table_name,
                "name": table_name,
                "columns": columns,
                "primaryKeys": pks,
                "rowCount": row_count,
            }
            schema["tables"].append(table_info)
            
            # Get foreign keys
            fks = self.get_foreign_keys(table_name)
            for fk in fks:
                schema["relationships"].append(fk)
        
        return schema
    
    def get_table_row_count(self, table_name: str) -> int:
        """Get total row count for a table"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text(f"SELECT COUNT(*) FROM `{table_name}`")
            )
            return result.scalar()
    
    def get_table_data(self, table_name: str, limit: int = 50, offset: int = 0) -> Tuple[List[Dict], int]:
        """
        Get paginated data from a table
        Returns (rows, total_count)
        """
        # Get total count
        total = self.get_table_row_count(table_name)
        
        # Get paginated data
        with self.engine.connect() as conn:
            query = text(f"SELECT * FROM `{table_name}` LIMIT {limit} OFFSET {offset}")
            result = conn.execute(query)
            
            # Convert to list of dicts
            # In SQLAlchemy 2.x, result.keys() yields plain strings, not tuples
            columns = list(result.keys())
            rows = [dict(zip(columns, row)) for row in result.fetchall()]
        
        return rows, total
