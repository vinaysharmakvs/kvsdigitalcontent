import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const start = html.indexOf('async function generateContent(learningOnly,manual=false){');
const end = html.indexOf('\nfunction cancelImageBatch()', start);
assert.ok(start > 0 && end > start, 'Studio generation function is present');
const generateSource = html.slice(start, end);

const mini = (name) => ({ question: `${name}?`, options: ['One', 'Two', 'Three'], answer: 'Two', explanation: `${name} explained.` });
const step = (name) => ({ title: `${name} title`, teachingText: `${name} teaching text`, keyIdea: `${name} key idea`, imagePrompt: `${name} picture brief`, novaScript: `${name} Nova`, miniQuestion: mini(name) });
const alternative = (name) => ({ label: name, teachingText: `${name} different object`, keyIdea: `${name} key`, imagePrompt: `${name} unique image`, novaScript: `${name} Nova`, miniQuestion: mini(name) });
const question = (name) => ({ question: `${name} question`, options: ['A', 'B', 'C'], answer: 'B', explanation: `${name} explanation`, difficulty: 'Easy', imagePrompt: `${name} image`, hints: ['First clue', 'Second clue', 'Third clue'], novaScript: `${name} Nova` });

function draft() {
  return {
    objective: 'Count objects together', method: 'Join two groups', explanation: 'Addition puts groups together',
    hint1: 'Count the first group', hint2: 'Count the second group', hint3: 'Count all',
    nova: 'Nova introduces addition', novaFeedback: 'Keep counting', imagePrompt: 'Two groups of apples',
    learningSteps: [step('Understand'), step('Example'), step('Remember')],
    exampleAlternatives: [alternative('Chocolate'), alternative('Ice cream')],
    cfu: Array.from({ length: 3 }, (_, index) => question(`Mission ${index + 1}`)),
    test: Array.from({ length: 5 }, (_, index) => question(`Test ${index + 1}`)),
    battle: Array.from({ length: 3 }, (_, index) => question(`Battle ${index + 1}`)),
    challenge: [question('Challenge 1')],
  };
}

function harness({ visuals = false } = {}) {
  const fields = new Map();
  const get = id => {
    if (!fields.has(id)) fields.set(id, { value: '', checked: false, disabled: false, style: {}, textContent: '', classList: { add() {}, remove() {} } });
    return fields.get(id);
  };
  get('autoVisuals').checked = visuals;
  const calls = { visual: [], workspace: [], fetch: [] };
  const context = {
    $: get, AbortSignal, console,
    document: { querySelectorAll: () => [] },
    learningStepNames: ['Understand', 'Example', 'Remember'],
    imageGenerationReady: visuals, saved: false,
    questionData: { cfu: [], test: [], battle: [], challenge: [] },
    questionCounters: { cfu: 0, test: 0, battle: 0, challenge: 0 },
    currentConcept: () => ({ name: 'Introduction to Addition' }),
    buildPayload: () => ({ curriculum: { grade: 'Grade 1', subject: 'Mathematics' }, concept: { name: 'Introduction to Addition' } }),
    clearGeneratedVisuals: () => {}, renderQuestions: () => {}, updatePayload: () => {},
    showWorkspace: area => calls.workspace.push(area),
    showToast: () => {},
    confirm: () => true,
    generateAllImages: async learningOnly => { calls.visual.push(learningOnly); return { completed: 18, failed: 0, total: 18, cancelled: false }; },
    fetch: async (url, options) => { calls.fetch.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => draft() }; },
  };
  runInNewContext(`${generateSource}\nthis.generateContent = generateContent;`, context);
  return { fields, get, calls, context };
}

test('one Generate click fills the three screens, two Example ways and all question banks', async () => {
  const { get, calls, context } = harness();
  await context.generateContent(false);
  assert.equal(get('learnExampleText').value, 'Example teaching text');
  assert.equal(get('exampleAlt1Text').value, 'Chocolate different object');
  assert.equal(get('exampleAlt2Text').value, 'Ice cream different object');
  assert.equal(get('exampleAlt1Question').value, 'Chocolate?');
  assert.equal(get('learnRememberExplanation').value, 'Remember explained.');
  assert.deepEqual(Object.fromEntries(Object.entries(context.questionData).map(([bank, list]) => [bank, list.length])), { cfu: 3, test: 5, battle: 3, challenge: 1 });
  assert.equal(context.questionData.battle[0].image_prompt, 'Battle 1 image');
  assert.equal(context.questionData.battle[0].nova_script, 'Battle 1 Nova');
  assert.equal(context.questionData.battle[0].hints, 'First clue | Second clue | Third clue');
  assert.equal('theme' in calls.fetch[0].body, false);
  assert.equal(context.questionData.battle[0].imagePrompt, undefined);
  assert.equal(calls.fetch[0].url, '/api/generate');
  assert.equal(calls.workspace.at(-1), 'review');
});

test('one Generate click starts the full picture batch when the provider is configured', async () => {
  const { get, calls, context } = harness({ visuals: true });
  await context.generateContent(false);
  assert.deepEqual(calls.visual, [false]);
  assert.match(get('generationStatus').textContent, /18\/18 matching pictures uploaded to R2/);
});

const queueStart = html.indexOf('async function generateAllImages(learningOnly,missingOnly=false){');
const queueEnd = html.indexOf('\nfunction downloadImage()', queueStart);
assert.ok(queueStart > 0 && queueEnd > queueStart, 'Studio image queue is present');
const queueSource = html.slice(queueStart, queueEnd);

function imageQueueHarness({ failedPrompt } = {}) {
  const fields = new Map();
  const get = id => {
    if (!fields.has(id)) fields.set(id, { value: '', textContent: '', style: {} });
    return fields.get(id);
  };
  const expectedPrompts = ['mission-image'];
  get('imagePrompt').value = expectedPrompts[0];
  const learningStepNames = ['Understand', 'Example', 'Remember'];
  for (const name of learningStepNames) {
    const prompt = `${name.toLowerCase()}-image`;
    get(`learn${name}ImagePrompt`).value = prompt;
    expectedPrompts.push(prompt);
  }
  for (const index of [1, 2]) {
    const prompt = `example-${index}-image`;
    get(`exampleAlt${index}ImagePrompt`).value = prompt;
    expectedPrompts.push(prompt);
  }
  const questionData = Object.fromEntries(Object.entries({ cfu: 3, test: 5, battle: 3, challenge: 1 }).map(([bank, count]) => [bank, Array.from({ length: count }, (_, index) => ({ id: `${bank}_${index + 1}`, image_prompt: `${bank}-${index + 1}-image`, image_url: '', image_alt: '' }))]));
  for (const bank of Object.values(questionData)) for (const question of bank) expectedPrompts.push(question.image_prompt);
  const calls = { prompts: [], active: 0, maxActive: 0, updates: 0, warnings: [] };
  const generatedQuestionImages = new Map();
  const context = {
    $: get, learningStepNames, questionData, generatedQuestionImages, cancelImageGeneration: false,
    document: { querySelector: selector => {
      const match = selector.match(/\[data-q="([^"]+)"\]\[data-field="([^"]+)"\]/);
      assert.ok(match, `Expected question field selector: ${selector}`);
      return get(`question:${match[1]}:${match[2]}`);
    } },
    attachImage: async (field, preview, button, prompt) => {
      assert.ok(field && preview && button);
      calls.prompts.push(prompt);
      calls.active++;
      calls.maxActive = Math.max(calls.maxActive, calls.active);
      try {
        await new Promise(resolve => setTimeout(resolve, 1));
        if (prompt === failedPrompt) throw Error('image provider failed');
        const portable = `https://images.example.com/${prompt}.webp`;
        field.value = portable;
        return { portable, url: `blob:${prompt}`, mimeType: 'image/webp' };
      } finally {
        calls.active--;
      }
    },
    updatePayload: () => { calls.updates++; },
    console: { warn: (...messages) => calls.warnings.push(messages.join(' ')) },
  };
  runInNewContext(`${queueSource}\nthis.generateAllImages = generateAllImages;`, context);
  return { context, calls, expectedPrompts, questionData, generatedQuestionImages, get };
}

test('the complete image queue processes all 18 targets one at a time', async () => {
  const { context, calls, expectedPrompts, generatedQuestionImages, get } = imageQueueHarness();
  const result = await context.generateAllImages(false);
  assert.equal(result.total, 18);
  assert.equal(result.completed, 18);
  assert.equal(result.failed, 0);
  assert.equal(calls.maxActive, 1);
  assert.deepEqual(calls.prompts, expectedPrompts);
  assert.equal(generatedQuestionImages.size, 12);
  assert.equal(calls.updates, 19);
  assert.match(get('generationStatus').textContent, /18\/18 finished/);
});

test('one failed image does not stop later targets in the queue', async () => {
  const { context, calls, expectedPrompts, questionData, generatedQuestionImages } = imageQueueHarness({ failedPrompt: 'test-2-image' });
  const result = await context.generateAllImages(false);
  assert.equal(result.total, 18);
  assert.equal(result.completed, 17);
  assert.equal(result.failed, 1);
  assert.equal(calls.maxActive, 1);
  assert.deepEqual(calls.prompts, expectedPrompts);
  assert.equal(questionData.test[1].image_url, '');
  assert.match(questionData.challenge[0].image_url, /^https:\/\/images.example.com\//);
  assert.equal(generatedQuestionImages.size, 11);
  assert.match(calls.warnings.join(' '), /test question: image provider failed/);
});

test('manual ChatGPT import uses validation endpoint and fills the editor',async()=>{
 const {get,calls,context}=harness();get('manualJson').value='```json\n'+JSON.stringify(draft())+'\n```';
 await context.generateContent(false,true);
 assert.equal(calls.fetch[0].url,'/api/import');assert.equal(get('learnExampleText').value,'Example teaching text');
});
test('malformed manual JSON preserves the current draft without a request',async()=>{
 const {get,calls,context}=harness();get('manualJson').value='{bad';get('explanation').value='Keep me';
 await context.generateContent(false,true);assert.equal(calls.fetch.length,0);assert.equal(get('explanation').value,'Keep me');
});

test('manual import reviews text before image generation even when the picture checkbox is on',async()=>{
 const {get,calls,context}=harness({visuals:true});get('manualJson').value=JSON.stringify(draft());
 await context.generateContent(false,true);
 assert.equal(calls.visual.length,0);assert.equal(calls.workspace.at(-1),'learning');
});

test('missing-image retry preserves existing URLs and generates only empty slots',async()=>{
 const {context,calls,get,questionData}=imageQueueHarness();
 get('imageUrl').value='https://images.example.com/existing.jpg';
 get('learnExampleImageUrl').value='https://images.example.com/example.jpg';
 questionData.test[0].image_url='https://images.example.com/test.jpg';
 const result=await context.generateAllImages(false,true);
 assert.equal(result.total,15);assert.equal(result.completed,15);
 assert.equal(calls.prompts.includes('mission-image'),false);
 assert.equal(calls.prompts.includes('example-image'),false);
 assert.equal(calls.prompts.includes('test-1-image'),false);
 assert.equal(get('imageUrl').value,'https://images.example.com/existing.jpg');
 assert.equal(questionData.test[0].image_url,'https://images.example.com/test.jpg');
});

test('content API button validates readiness on click and sends the complete reviewed package unchanged',()=>{
 assert.match(html,/id="publishApiBtn" onclick="publishToApi\(\)"/);
 assert.doesNotMatch(html,/id="publishApiBtn"[^>]*disabled/);
 assert.match(html,/reviewReadiness\(payload\)\.filter/);
 assert.match(html,/body:JSON\.stringify\(payload\)/);
 assert.doesNotMatch(html,/function buildContentFeedPayload\(/);
});
