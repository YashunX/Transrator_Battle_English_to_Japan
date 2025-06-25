/**************** 設定 ****************/
const OPENAI_API_KEY = "";   // API_KEY_HERE
const PASS_SCORE     = 65;                       // 65 点以上で「正解」
const LOCAL_FALLBACK = [
  { en:"Knowledge is power.",           ja:"知識は力なり。" },
  //{ en:"Practice makes perfect.",       ja:"継続は力なり。" },
  //{ en:"Time flies like an arrow.",     ja:"光陰矢のごとし。" },
  //{ en:"Actions speak louder than words.", ja:"言葉より行動が物を言う。" }
];

/**************** 状態変数 ****************/
let enemyHP = 100, playerHP = 100;
let currentPhrase = "", currentIdealJa = "";

const recognition = new webkitSpeechRecognition();
recognition.interimResults = false;
recognition.lang = "ja-JP";

/**************** DOM ヘルパ ****************/
const $ = id => document.getElementById(id);
const enemyBar = $("enemyHP"), playerBar = $("playerHP"), phraseBox = $("phraseBox");
const statusBox = $("status"), userAnsBox = $("userAnswer"), corrAnsBox = $("correctAnswer");
const scoreBox  = $("scoreLine"), feedbackBox = $("feedbackLine"), logBox = $("log");
const startBtn  = $("startBtn"),   speakBtn   = $("speakBtn");

/**************** ゲーム開始 ****************/
startBtn.onclick = () => {
  enemyHP = playerHP = 100;       updateBars();
  [userAnsBox,corrAnsBox,scoreBox,feedbackBox,logBox].forEach(el=>el.innerText="");
  statusBox.innerText = "バトル開始！日本語で翻訳を答えてください";
  nextTurn();
};

/**************** 次ターン ****************/
async function nextTurn() {
  if (enemyHP <= 0 || playerHP <= 0) {
    statusBox.innerText = enemyHP <= 0 ? "🎉 勝利！" : "💀 敗北…";
    speakBtn.disabled = true;   return;
  }

  /* --- AI から新規問題取得 --- */
  try {
    const q = await getPhraseFromAI();      // {en,ja}
    currentPhrase  = q.en;
    currentIdealJa = q.ja;
  } catch(e) {
    console.warn("AI 取得失敗→ローカル問題使用:", e.message);
    const f = LOCAL_FALLBACK[Math.floor(Math.random()*LOCAL_FALLBACK.length)];
    currentPhrase  = f.en;
    currentIdealJa = f.ja;
  }

  phraseBox.innerText = `🗣 英語フレーズ: "${currentPhrase}"`;
  [userAnsBox,corrAnsBox,scoreBox,feedbackBox].forEach(el=>el.innerText="");
  speakBtn.disabled = false;
}

/**************** 音声入力 ****************/
speakBtn.onclick = () => { statusBox.innerText="🎙️ 聞き取り中…"; recognition.start(); };

recognition.onresult = async e => {
  const userSpeech = e.results[0][0].transcript;
  userAnsBox.innerText = "あなたの回答: " + userSpeech;
  statusBox.innerText  = "判定中…";   speakBtn.disabled = true;

  const {score,ideal,feedback} = await judgeAnswer(currentPhrase,userSpeech);
  scoreBox.innerText    = `得点: ${score} / 100`;
  feedbackBox.innerText = `コメント: ${feedback}`;
  corrAnsBox.innerText  = "正しい訳: " + ideal;

  applyDamage(score >= PASS_SCORE);
  setTimeout(nextTurn, 10000);
};

/**************** AI 問題生成 ****************/
async function getPhraseFromAI() {
  const prompt = `
# 指示
5〜12 語程度の自然な英文を 1 文作り、その自然な日本語訳を付け、
必ず JSON 形式 {"en":"...","ja":"..."} だけを返答してください。
コードブロックや説明は不要です。`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json",
              "Authorization":`Bearer ${OPENAI_API_KEY}` },
    body:JSON.stringify({
      model:"gpt-4o",
      messages:[{role:"user",content:prompt}],
      max_tokens:60, temperature:0.9, top_p:0.9
    })
  }).then(r=>r.json());

  const text = res?.choices?.[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if(!match) throw new Error("JSON not found");
  return JSON.parse(match[0]);
}

/**************** 採点 ****************/
async function judgeAnswer(en,jaUser){
  const prompt = `
次の日本語訳が英語原文とどの程度一致しているか 0〜100 点で採点し、
模範訳と 1 行コメントを添えて
{"score":数値,"ideal":"...","feedback":"..."} の JSON のみ返答してください。
英語: ${en}
日本語: ${jaUser}`.trim();

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{ "Content-Type":"application/json",
              "Authorization":`Bearer ${OPENAI_API_KEY}` },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[{role:"user",content:prompt}],
      max_tokens:120, temperature:0
    })
  }).then(r=>r.json()).catch(()=>null);

  let txt = res?.choices?.[0]?.message?.content ?? "";
  const m   = txt.match(/\{[\s\S]*\}/);
  let data;
  try{ data = JSON.parse(m ? m[0] : txt); }catch{}
  if(!data||typeof data.score!=="number")
    return {score:0,ideal:currentIdealJa,feedback:"解析失敗"};
  return data;
}

/**************** ダメージ ****************/
function applyDamage(ok){
  if(ok){ enemyHP=Math.max(0,enemyHP-20);
          statusBox.innerText="✅ 正解！敵に 20 ダメージ！";}
  else  { playerHP=Math.max(0,playerHP-10);
          statusBox.innerText="❌ 不正解…あなたは 10 ダメージ！";}
  updateBars();
  logBox.innerText+=`\n【結果】${statusBox.innerText}`;
}

/**************** HP バー更新 ****************/
function updateBars(){
  enemyBar.style.width  = enemyHP  + "%";
  playerBar.style.width = playerHP + "%";
}
