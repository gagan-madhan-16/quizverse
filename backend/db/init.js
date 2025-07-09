const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  console.log('Initializing database...');
  
  try {
    console.log('Reading schema file...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema SQL statements...');
    const statements = schemaSql
      .replace(/--.*$|\/\*[\s\S]*?\*\//gm, '') 
      .split(';')
      .filter(stmt => stmt.trim() !== '');
    
    for (const statement of statements) {
      const trimmedStatement = statement.trim();
      if (trimmedStatement) {
        console.log(`Executing statement: ${trimmedStatement.substring(0, 50)}...`);
        await pool.query(trimmedStatement);
      }
    }

    console.log('Database schema initialized successfully.');
  } catch (err) {
    console.error('Error initializing database:', err);
    console.error('Failed to initialize database schema. Error details:', err.message || err);
    if (err.position) {
      console.error(`Error position in SQL: ${err.position}`);
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const errorPosition = parseInt(err.position);
      console.error(`SQL context: ${schemaSql.substring(Math.max(0, errorPosition - 30), errorPosition + 30)}`);
    }
    process.exit(1);
  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Database initialization process finished.');
  }
}

if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
