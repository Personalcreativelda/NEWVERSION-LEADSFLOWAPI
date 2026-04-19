const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const FILES = [
  'src/app/components/navigation/InboxTreeMenu.tsx',
  'src/app/components/inbox/ai-assistants/AssistantForm.tsx',
  'src/app/components/chat/ChatInput.tsx',
  'src/app/components/inbox/ChatHeader.tsx',
  'src/app/components/inbox/ContactDetailsPanel.tsx',
  'src/app/components/inbox/ai-assistants/AssistantsList.tsx',
  'src/app/components/inbox/MessageInput.tsx',
  'src/app/components/FloatingChat.tsx',
  'src/app/components/tasks/TaskManager.tsx',
  'src/app/components/Footer.tsx',
  // Additional inbox/chat/assistant files
  'src/app/components/inbox/ChatPanel.tsx',
  'src/app/components/inbox/ChatBackground.tsx',
  'src/app/components/inbox/MessageBubble.tsx',
  'src/app/components/inbox/NewConversationModal.tsx',
  'src/app/components/inbox/channels/ChannelsList.tsx',
  'src/app/components/inbox/channels/ChannelCard.tsx',
  'src/app/components/inbox/tags/TagsList.tsx',
  'src/app/components/inbox/tags/TagEditModal.tsx',
  'src/app/components/inbox/tags/TagCreateModal.tsx',
  'src/app/components/inbox/tags/AddLeadsToTagModal.tsx',
  'src/app/components/inbox/channels/WhatsAppConnect.tsx',
  'src/app/components/inbox/channels/WhatsAppCloudConnect.tsx',
  'src/app/components/pages/inbox/InboxSettings.tsx',
  'src/app/components/pages/inbox/InboxConversations.tsx',
  'src/app/components/pages/inbox/InboxChannels.tsx',
  'src/app/components/pages/inbox/InboxAutomations.tsx',
  'src/app/components/pages/inbox/InboxAssistants.tsx',
  // Additional discovered files
  'src/app/components/inbox/ConversationItem.tsx',
  'src/app/components/inbox/integrations/IntegrationCard.tsx',
  'src/app/components/inbox/channels/WebsiteWidgetConnect.tsx',
  'src/app/components/inbox/channels/FacebookConnect.tsx',
  'src/app/components/inbox/channels/TwilioSMSConnect.tsx',
  'src/app/components/inbox/channels/EmailConnect.tsx',
  'src/app/components/inbox/channels/InstagramConnect.tsx',
  'src/app/components/inbox/GroupDetailsPanel.tsx',
  // Chat components
  'src/app/components/chat/TypingIndicator.tsx',
  'src/app/components/chat/ChatMessage.tsx',
  'src/app/components/chat/SatisfactionRating.tsx',
  'src/app/components/chat/QuickReplies.tsx',
  'src/app/components/chat/ChatWidget.tsx',
  // Channels
  'src/app/components/inbox/channels/TelegramConnect.tsx',
];

// Order matters: more specific patterns first
const REPLACEMENTS = [
  // ========== isDark ternary patterns ==========
  // bg patterns
  [/\$\{isDark\s*\?\s*['"]bg-(?:slate|gray)-(?:800|900|950)['"]\s*:\s*['"]bg-white['"]\}/g, 'bg-card'],
  [/\$\{isDark\s*\?\s*['"]bg-(?:slate|gray)-(?:700|800|900)['"]\s*:\s*['"]bg-(?:gray|slate)-(?:50|100)['"]\}/g, 'bg-muted'],
  // text patterns  
  [/\$\{isDark\s*\?\s*['"]text-white['"]\s*:\s*['"]text-(?:gray|slate)-900['"]\}/g, 'text-foreground'],
  [/\$\{isDark\s*\?\s*['"]text-(?:gray|slate)-\d+['"]\s*:\s*['"]text-(?:gray|slate)-\d+['"]\}/g, 'text-muted-foreground'],
  // border patterns
  [/\$\{isDark\s*\?\s*['"]border-(?:gray|slate)-(?:600|700|800)['"]\s*:\s*['"]border-(?:gray|slate)-(?:200|300)['"]\}/g, 'border-border'],
  // hover patterns  
  [/\$\{isDark\s*\?\s*['"]hover:bg-(?:gray|slate)-(?:700|800)['"]\s*:\s*['"]hover:bg-(?:gray|slate)-(?:50|100)['"]\}/g, 'hover:bg-muted/50'],

  // ========== bg-white dark:bg-* compound ==========
  [/bg-white\s+dark:bg-(?:gray|slate)-(?:800|900|950)/g, 'bg-card'],
  [/bg-white\s+dark:bg-(?:gray|slate)-(?:700)/g, 'bg-card'],

  // ========== bg-gray-400/500 dark:bg-gray-* compound (typing indicator, etc) ==========
  [/bg-gray-400\s+dark:bg-(?:gray|slate)-\d+/g, 'bg-muted-foreground/50'],
  [/bg-gray-500\s+dark:bg-(?:gray|slate)-\d+/g, 'bg-muted-foreground'],

  // ========== bg-gray-50 dark:bg-* compound ==========
  [/bg-gray-50\s+dark:bg-(?:gray|slate)-(?:800|900|950)/g, 'bg-muted/50'],
  [/bg-slate-50\s+dark:bg-(?:gray|slate)-(?:800|900|950)/g, 'bg-muted/50'],

  // ========== bg-gray-100 dark:bg-* compound ==========
  [/bg-gray-100\s+dark:bg-(?:gray|slate)-(?:800|900|950)/g, 'bg-muted'],
  [/bg-slate-100\s+dark:bg-(?:gray|slate)-(?:800|900|950)/g, 'bg-muted'],
  [/bg-gray-100\s+dark:bg-(?:gray|slate)-700/g, 'bg-muted'],

  // ========== hover:bg-* dark:hover:bg-* compound ==========
  [/hover:bg-gray-(?:50|100)\s+dark:hover:bg-(?:gray|slate)-(?:\d+)(?:\/\d+)?/g, 'hover:bg-muted/50'],
  [/hover:bg-slate-(?:50|100)\s+dark:hover:bg-(?:gray|slate)-(?:\d+)(?:\/\d+)?/g, 'hover:bg-muted/50'],

  // ========== text-gray-900 dark:text-white ==========
  [/text-gray-900\s+dark:text-white/g, 'text-foreground'],
  [/text-slate-900\s+dark:text-white/g, 'text-foreground'],
  [/text-gray-900\s+dark:text-gray-(?:50|100)/g, 'text-foreground'],

  // ========== text-gray-800 dark:text-* ==========
  [/text-gray-800\s+dark:text-(?:gray|slate)-\d+/g, 'text-foreground'],
  [/text-gray-800\s+dark:text-white/g, 'text-foreground'],
  [/text-slate-800\s+dark:text-white/g, 'text-foreground'],

  // ========== text-gray-700 dark:text-gray-300 ==========
  [/text-gray-700\s+dark:text-gray-(?:200|300)/g, 'text-foreground/80'],
  [/text-slate-700\s+dark:text-(?:gray|slate)-(?:200|300)/g, 'text-foreground/80'],

  // ========== text-gray-600 dark:text-gray-* ==========
  [/text-gray-600\s+dark:text-(?:gray|slate)-\d+/g, 'text-muted-foreground'],
  [/text-slate-600\s+dark:text-(?:gray|slate)-\d+/g, 'text-muted-foreground'],

  // ========== text-gray-500 dark:text-gray-* ==========
  [/text-gray-500\s+dark:text-(?:gray|slate)-\d+/g, 'text-muted-foreground'],
  [/text-slate-500\s+dark:text-(?:gray|slate)-\d+/g, 'text-muted-foreground'],

  // ========== text-gray-100 dark:text-gray-* (light on dark backgrounds) ==========
  [/text-gray-100\s+dark:text-(?:gray|slate)-\d+/g, 'text-foreground'],

  // ========== border compounds ==========
  [/border-gray-200\s+dark:border-(?:gray|slate)-(?:600|700|800)/g, 'border-border'],
  [/border-gray-300\s+dark:border-(?:gray|slate)-(?:600|700|800)/g, 'border-border'],
  [/border-slate-200\s+dark:border-(?:gray|slate)-(?:600|700|800)/g, 'border-border'],
  [/border-slate-300\s+dark:border-(?:gray|slate)-(?:600|700|800)/g, 'border-border'],

  // ========== dark:hover patterns (standalone) ==========
  [/dark:hover:bg-(?:gray|slate)-(?:700|800|900)/g, ''],
  [/dark:hover:border-(?:gray|slate)-\d+/g, ''],

  // ========== dark:text standalone (clean up remaining) ==========
  [/dark:text-(?:gray|slate)-\d+/g, ''],
  [/dark:bg-(?:gray|slate)-(?:700|800|900|950)/g, ''],
  [/dark:border-(?:gray|slate)-\d+/g, ''],

  // ========== Standalone classes (after compounds are handled) ==========
  // Standalone bg
  [/\bbg-gray-50\b/g, 'bg-muted/50'],
  [/\bbg-slate-50\b/g, 'bg-muted/50'],
  [/\bbg-gray-100\b/g, 'bg-muted'],
  [/\bbg-slate-100\b/g, 'bg-muted'],
  [/\bbg-gray-200\b/g, 'bg-muted'],
  [/\bbg-slate-200\b/g, 'bg-muted'],
  [/\bbg-gray-300\b/g, 'bg-muted'],
  [/\bbg-slate-300\b/g, 'bg-muted'],
  [/\bbg-gray-400\b/g, 'bg-muted-foreground/70'],
  [/\bbg-gray-500\b/g, 'bg-muted-foreground'],
  [/\bbg-slate-400\b/g, 'bg-muted-foreground/70'],
  [/\bbg-slate-500\b/g, 'bg-muted-foreground'],
  [/\bbg-slate-800\b/g, 'bg-card'],
  [/\bbg-slate-900\b/g, 'bg-card'],

  // Standalone hover:bg
  [/\bhover:bg-gray-50\b/g, 'hover:bg-muted/50'],
  [/\bhover:bg-gray-100\b/g, 'hover:bg-muted/50'],
  [/\bhover:bg-slate-50\b/g, 'hover:bg-muted/50'],
  [/\bhover:bg-slate-100\b/g, 'hover:bg-muted/50'],
  [/\bhover:bg-gray-200\b/g, 'hover:bg-muted'],
  [/\bhover:bg-slate-700\b/g, 'hover:bg-muted'],

  // Standalone text-gray (careful order: 900, 800, 700, 600, 500, 400)
  // text-gray-900 standalone in className context (not in style context)
  [/\btext-gray-900\b(?!\s+dark:)/g, 'text-foreground'],
  [/\btext-slate-900\b(?!\s+dark:)/g, 'text-foreground'],
  [/\btext-gray-800\b(?!\s+dark:)/g, 'text-foreground'],
  [/\btext-slate-800\b(?!\s+dark:)/g, 'text-foreground'],
  [/\btext-gray-700\b(?!\s+dark:)/g, 'text-foreground/80'],
  [/\btext-slate-700\b(?!\s+dark:)/g, 'text-foreground/80'],
  [/\btext-gray-600\b(?!\s+dark:)/g, 'text-muted-foreground'],
  [/\btext-slate-600\b(?!\s+dark:)/g, 'text-muted-foreground'],
  [/\btext-gray-500\b(?!\s+dark:)/g, 'text-muted-foreground'],
  [/\btext-slate-500\b(?!\s+dark:)/g, 'text-muted-foreground'],
  [/\btext-gray-400\b/g, 'text-muted-foreground/70'],
  [/\btext-slate-400\b/g, 'text-muted-foreground/70'],
  [/\btext-gray-300\b/g, 'text-muted-foreground'],

  // Standalone border
  [/\bborder-gray-200\b(?!\s+dark:)/g, 'border-border'],
  [/\bborder-slate-200\b(?!\s+dark:)/g, 'border-border'],
  [/\bborder-gray-300\b(?!\s+dark:)/g, 'border-border'],
  [/\bborder-slate-300\b(?!\s+dark:)/g, 'border-border'],
  [/\bborder-gray-700\b/g, 'border-border'],
  [/\bborder-slate-700\b/g, 'border-border'],

  // hover:border patterns
  [/\bhover:border-gray-\d+\b/g, 'hover:border-border'],

  // divide
  [/\bdivide-gray-\d+\b/g, 'divide-border'],
  [/\bdivide-slate-\d+\b/g, 'divide-border'],

  // ring
  [/\bring-gray-\d+\b/g, 'ring-border'],
  [/\bring-slate-\d+\b/g, 'ring-border'],

  // placeholder
  [/\bplaceholder-gray-\d+\b/g, 'placeholder-muted-foreground'],
  [/\bplaceholder-slate-\d+\b/g, 'placeholder-muted-foreground'],

  // from-gray/to-gray gradients
  [/\bfrom-gray-400\b/g, 'from-muted-foreground/70'],
  [/\bfrom-gray-500\b/g, 'from-muted-foreground'],
  [/\bto-gray-500\b/g, 'to-muted-foreground'],
  [/\bto-gray-700\b/g, 'to-muted-foreground'],

  // ========== bg-white standalone (only in card/modal/panel context) ==========
  // We'll handle bg-white in context - but NOT globally as it's used in many valid places
  // Only replace bg-white when it appears alone (not already part of a compound that was handled)

  // NOTE: Space cleanup is done in a separate pass below, only inside className strings
];

// Track per-file stats
const stats = {};
let totalReplacements = 0;

for (const relPath of FILES) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(absPath, 'utf8');
  const original = content;
  let fileCount = 0;

  for (const [pattern, replacement] of REPLACEMENTS) {
    const matches = content.match(pattern);
    if (matches) {
      fileCount += matches.length;
      content = content.replace(pattern, replacement);
    }
  }

  if (content !== original) {
    // Post-processing: clean up extra spaces ONLY inside className attributes
    // Handle className="..." and className={`...`} and className={'...'}
    content = content.replace(/(className\s*=\s*(?:"|{`|{'))([^"`'}]*?)(?="|`}|'})/g, (match, prefix, classes) => {
      // Collapse multiple spaces into one, trim trailing space
      let cleaned = classes.replace(/  +/g, ' ').replace(/ $/, '');
      return prefix + cleaned;
    });

    fs.writeFileSync(absPath, content, 'utf8');
    stats[relPath] = fileCount;
    totalReplacements += fileCount;
    console.log(`✅ ${relPath}: ${fileCount} replacements`);
  } else {
    console.log(`⏭️  ${relPath}: no changes needed`);
  }
}

console.log('\n========== SUMMARY ==========');
console.log(`Total files processed: ${FILES.length}`);
console.log(`Total files modified: ${Object.keys(stats).length}`);
console.log(`Total replacements: ${totalReplacements}`);
for (const [file, count] of Object.entries(stats)) {
  console.log(`  ${file}: ${count}`);
}
