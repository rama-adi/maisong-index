#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { $ } from 'bun';

function findTrpcImportAlias(content: string): { line: string; alias: string } | null {
  // Matches: import * as _trpc_server from '@trpc/server';
  const importRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]@trpc\/server['"];?/;
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(importRegex);
    if (match) {
      return { line, alias: match[1]! };
    }
  }
  return null;
}

function extractBuiltRouterBlock(content: string, alias: string): { decl: string; name: string } | null {
  // Find every occurrence of: declare const <name>: <alias>.TRPCBuiltRouter< ... >;
  const occurrences: { start: number; end: number; name: string }[] = [];
  const pattern = new RegExp(`declare\\s+const\\s+(\\w+)\\s*:\\s*${alias}\\.TRPCBuiltRouter<`, 'g');

  for (let match = pattern.exec(content); match; match = pattern.exec(content)) {
    const name = match[1]!;
    const start = match.index;
    // Start scanning after the first '<'
    let i = pattern.lastIndex - 1; // position at '<'
    let angleDepth = 1;

    while (i < content.length && angleDepth > 0) {
      i++;
      const ch = content[i];
      if (!ch) break;
      if (ch === '<') angleDepth++;
      else if (ch === '>') angleDepth--;
    }

    // Now find the next semicolon after generics are closed
    while (i < content.length && content[i] !== ';') i++;
    if (content[i] === ';') i++;

    occurrences.push({ start, end: i, name });
  }

  if (occurrences.length === 0) return null;

  // Choose the longest declaration (top-level router tends to be the largest)
  const chosen = occurrences.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return { decl: content.slice(chosen.start, chosen.end), name: chosen.name };
}

function normalizeContextAndRename(decl: string, originalName: string, exportName: string): string {
  let processed = decl;
  // Replace any ctx: { ... } or ctx: {} with ctx: any to make client context-agnostic
  processed = processed.replace(/ctx:\s*\{\s*\}/g, 'ctx: any');
  processed = processed.replace(/ctx:\s*\{[\s\S]*?\}/g, 'ctx: any');
  // Rename variable to trpcApi
  processed = processed.replace(new RegExp(`\\b${originalName}\\b`, 'g'), exportName);
  return processed;
}

type ExtractOptions = {
  exportName: string;
  typeAliasName: string;
};

function extractTrpcDeclarations(content: string, options: ExtractOptions): string {
  const importInfo = findTrpcImportAlias(content);
  if (!importInfo) {
    throw new Error("Could not find '@trpc/server' import in the generated d.ts");
  }

  const built = extractBuiltRouterBlock(content, importInfo.alias);
  if (!built) {
    throw new Error('Could not find TRPCBuiltRouter declaration in the generated d.ts');
  }

  const decl = normalizeContextAndRename(built.decl, built.name, options.exportName);

  const result: string[] = [];
  result.push(importInfo.line);
  result.push('');
  result.push(decl.trim());
  result.push(`type ${options.typeAliasName} = typeof ${options.exportName};`);
  result.push('');
  result.push(`export { type ${options.typeAliasName}, ${options.exportName} };`);
  return result.join('\n');
}

async function codegenTrpc(): Promise<void> {
  try {
    console.log('🔨 Building TRPC types...');
    const envConfig = process.env.CODEGEN_TSUP_CONFIG?.trim();
    const configCandidates = envConfig && existsSync(resolve(envConfig))
      ? [envConfig]
      : ['@tsup.trpc.ts', 'tsup.trpc.ts'];
    const resolvedConfig = configCandidates
      .map((candidate) => resolve(candidate))
      .find((absPath) => existsSync(absPath));

    if (!resolvedConfig) {
      throw new Error(
        'Could not find a tsup config. Looked for @tsup.trpc.ts and tsup.trpc.ts in the project root.'
      );
    }

    await $`tsup --config ${resolvedConfig}`;
    
    console.log('📖 Reading generated declaration file...');
    const dtsPath = resolve(process.env.CODEGEN_DTS_FILE ?? '.temp_transform/index.d.ts');
    const content = readFileSync(dtsPath, 'utf-8');
    
    console.log('🧹 Extracting and cleaning TRPC declarations...');
    const exportName = process.env.CODEGEN_EXPORT_NAME?.trim() || 'trpcApi';
    const typeAliasName = process.env.CODEGEN_TYPE_NAME?.trim() || 'API';
    const extracted = extractTrpcDeclarations(content, { exportName, typeAliasName });
    
    console.log('🗑️  Cleaning up temporary files...');
    await $`rm -rf .temp_transform`;
    
    console.log('📁 Creating dist directory...');
    const outFile = resolve(process.env.CODEGEN_OUT_FILE ?? 'dist/api.d.ts');
    await $`mkdir -p ${dirname(outFile)}`;
    
    console.log(`💾 Writing clean API types to ${outFile}...`);
    writeFileSync(outFile, extracted);
    
    console.log('✅ TRPC codegen completed successfully!');
  } catch (error) {
    console.error('❌ Error during codegen:', error);
    process.exit(1);
  }
}

// Run the codegen
await codegenTrpc(); 