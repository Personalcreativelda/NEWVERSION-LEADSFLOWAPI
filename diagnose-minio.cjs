#!/usr/bin/env node

/**
 * Script de diagnóstico completo do MinIO
 * Testa conexão, buckets e upload real
 */

const { Client } = require('minio');

async function testMinIO() {
  console.log('\n🔍 DIAGNÓSTICO COMPLETO DO MINIO\n');
  console.log('='.repeat(60));

  // Configuração (pegue do .env ou variáveis de ambiente)
  const config = {
    endPoint: process.env.MINIO_ENDPOINT || 'minio.personalcreativelda.com',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO || '',
    secretKey: process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO || '',
  };

  const bucket = process.env.MINIO_BUCKET || 'leadflow-avatars';

  console.log('\n📋 Configuração:');
  console.log('  Endpoint:', config.endPoint);
  console.log('  Port:', config.port);
  console.log('  UseSSL:', config.useSSL);
  console.log('  Bucket:', bucket);
  console.log('  AccessKey:', config.accessKey ? `${config.accessKey.substring(0, 10)}...` : '❌ NÃO CONFIGURADO');
  console.log('  SecretKey:', config.secretKey ? `${config.secretKey.substring(0, 10)}...` : '❌ NÃO CONFIGURADO');

  if (!config.accessKey || !config.secretKey) {
    console.log('\n❌ Credenciais não configuradas!');
    console.log('Configure MINIO_ACCESS_KEY e MINIO_SECRET_KEY');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTE 1: Criar Cliente MinIO');
  console.log('='.repeat(60));

  let client;
  try {
    client = new Client(config);
    console.log('✅ Cliente MinIO criado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao criar cliente:', error.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTE 2: Listar Todos os Buckets');
  console.log('='.repeat(60));

  try {
    const buckets = await client.listBuckets();
    console.log(`✅ Conectado ao MinIO! Encontrados ${buckets.length} bucket(s):\n`);

    buckets.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.name}`);
      console.log(`     Criado em: ${b.creationDate}`);
    });

    if (buckets.length === 0) {
      console.log('  ⚠️ Nenhum bucket encontrado!');
    }
  } catch (error) {
    console.error('❌ Erro ao listar buckets:', error.message);
    console.error('\n💡 Possíveis causas:');
    console.error('  - Credenciais incorretas');
    console.error('  - Endpoint não acessível');
    console.error('  - Porta bloqueada');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`TESTE 3: Verificar Bucket "${bucket}"`);
  console.log('='.repeat(60));

  try {
    const exists = await client.bucketExists(bucket);
    if (exists) {
      console.log(`✅ Bucket "${bucket}" existe!`);
    } else {
      console.log(`❌ Bucket "${bucket}" NÃO existe!`);
      console.log(`\n💡 Crie o bucket "${bucket}" no MinIO Console ou escolha um bucket existente.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erro ao verificar bucket:', error.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTE 4: Upload de Arquivo de Teste');
  console.log('='.repeat(60));

  try {
    const testFileName = `test/upload_test_${Date.now()}.txt`;
    const testContent = Buffer.from(`MinIO Test Upload - ${new Date().toISOString()}`);

    console.log(`  Fazendo upload: ${testFileName}`);

    await client.putObject(bucket, testFileName, testContent, testContent.length, {
      'Content-Type': 'text/plain',
    });

    console.log('✅ Upload realizado com sucesso!');

    // Gerar URL
    const protocol = config.useSSL ? 'https' : 'http';
    const port = config.port !== 443 && config.port !== 80 ? `:${config.port}` : '';
    const url = `${protocol}://${config.endPoint}${port}/${bucket}/${testFileName}`;

    console.log(`\n📎 URL do arquivo:`);
    console.log(`   ${url}`);
    console.log(`\n💡 Teste acessar esta URL no navegador para verificar se está público.`);

  } catch (error) {
    console.error('❌ Erro no upload:', error.message);
    console.error('\n💡 Possíveis causas:');
    console.error('  - Permissões do bucket incorretas');
    console.error('  - Access Key sem permissão de escrita');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('TESTE 5: Verificar Policy do Bucket');
  console.log('='.repeat(60));

  try {
    const policy = await client.getBucketPolicy(bucket);
    console.log('✅ Policy do bucket:');
    console.log(JSON.stringify(JSON.parse(policy), null, 2));
  } catch (error) {
    if (error.message.includes('does not have a bucket policy')) {
      console.log('⚠️ Bucket não tem policy configurada (arquivos podem não ser acessíveis publicamente)');
      console.log('\n💡 Configure policy pública para permitir acesso aos arquivos:');
      console.log('   1. Acesse MinIO Console');
      console.log('   2. Clique no bucket');
      console.log('   3. Access → Public ou configure policy JSON');
    } else {
      console.error('❌ Erro ao obter policy:', error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ DIAGNÓSTICO CONCLUÍDO');
  console.log('='.repeat(60));
  console.log('\nSe todos os testes passaram, o MinIO está configurado corretamente!');
  console.log('Se o sistema ainda usa Base64, verifique:');
  console.log('  1. As variáveis de ambiente estão carregadas no container?');
  console.log('  2. Fez redeploy após configurar as variáveis?');
  console.log('  3. Os logs do servidor mostram "Using MinIO S3 storage"?');
  console.log('');
}

// Executar
testMinIO().catch(error => {
  console.error('\n❌ ERRO FATAL:', error);
  process.exit(1);
});
