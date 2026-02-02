import fs from 'fs';
import path from 'path';
import pool from './connection';

const readSchemaFile = () => {
  const primaryPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf-8');
  }

  const fallbackPath = path.join(process.cwd(), 'src', 'database', 'schema.sql');
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf-8');
  }

  throw new Error('schema.sql not found. Ensure it exists in src/database.');
};

export const initDatabase = async () => {
  try {
    const schema = readSchemaFile();
    await pool.query(schema);
    console.log('Database schema initialized successfully');
  } catch (error: any) {
    if (error.code === '42P07') {
      console.log('Tables already exist, skipping initialization');
    } else {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
};
