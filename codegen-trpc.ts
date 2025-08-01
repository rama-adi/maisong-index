#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { $ } from 'bun';

function extractTrpcDeclarations(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  
  // Find and extract _trpc_server import
  const trpcImportLine = lines.find(line => 
    line.trim().includes('import') && line.includes('_trpc_server')
  );
  
  if (trpcImportLine) {
    result.push(trpcImportLine);
    result.push(''); // Add empty line for spacing
  }
  
  // Find the /TRPC comment line
  const trpcCommentIndex = lines.findIndex(line => 
    line.includes('/** /TRPC */')
  );
  
  if (trpcCommentIndex === -1) {
    throw new Error('Could not find /** /TRPC */ comment in the file');
  }
  
  // Extract everything after the /TRPC comment
  const trpcSection = lines.slice(trpcCommentIndex);
  
  // Process the TRPC section to simplify context types and rename
  let processedContent = trpcSection.join('\n');
  
  // Replace multi-line context objects with simple 'ctx: any'
  processedContent = processedContent.replace(/ctx:\s*\{\s*\}/g, 'ctx: any');
  processedContent = processedContent.replace(/ctx:\s*\{\s*[\s\S]*?\}/g, 'ctx: any');
  
  // Rename appRouter to trpcApi
  processedContent = processedContent.replace(/\bappRouter\b/g, 'trpcApi');
  
  // Rename AppRouter to API
  processedContent = processedContent.replace(/\bAppRouter\b/g, 'API');
  
  const processedSection = processedContent.split('\n');
  
  result.push(...processedSection);
  
  return result.join('\n');
}

async function codegenTrpc(): Promise<void> {
  try {
    console.log('🔨 Building TRPC types...');
    await $`tsup --config tsup.trpc.ts`;
    
    console.log('📖 Reading generated declaration file...');
    const content = readFileSync(resolve('.temp_transform/index.d.ts'), 'utf-8');
    
    console.log('🧹 Extracting and cleaning TRPC declarations...');
    const extracted = extractTrpcDeclarations(content);
    
    console.log('🗑️  Cleaning up temporary files...');
    await $`rm -rf .temp_transform`;
    
    console.log('📁 Creating dist directory...');
    await $`mkdir -p dist`;
    
    console.log('💾 Writing clean API types to dist/api.d.ts...');
    writeFileSync(resolve('dist/api.d.ts'), extracted);
    
    console.log('✅ TRPC codegen completed successfully!');
  } catch (error) {
    console.error('❌ Error during codegen:', error);
    process.exit(1);
  }
}

// Run the codegen
await codegenTrpc(); 