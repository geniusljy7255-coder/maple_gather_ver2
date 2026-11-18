import { applyTimerFormat, readDigits } from './digits.js';
/* 아이콘 찾기 알고리즘 (DOM 없이 동작 → Worker와 테스트에서 공통 사용)
 *
 * - 밝기와 무관하게 "모양"만 비교한다 (ZNCC: 영점 정규화 상관). 아이콘은 시간이 지나면 흐려지기 때문.
 * - 가운데 숫자가 덮는 자리는 비교에서 제외한다 (링 모양 마스크).
 * - 절반 해상도에서 후보를 먼저 거르고, 원본 해상도에서 정밀 확인한다.
 * - 남은 숫자는 digits.js에서 판독하고 tracking-state.js에서 시간 흐름을 검증한다. */

export const ICON = 32;
const TRACK_SLACK = 0.02;

/* ---------- 기초 ---------- */
export function toGray(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3;
  return g;
}

function halve(g, w, h) {
  const w2 = w >> 1, h2 = h >> 1, o = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const i = (y * 2) * w + x * 2;
      o[y * w2 + x] = (g[i] + g[i + 1] + g[i + w] + g[i + w + 1]) / 4;
    }
  }
  return { g: o, w: w2, h: h2 };
}

/** 합계 이미지(summed-area table): 어떤 사각형의 합이든 O(1)로 구한다 */
function integral(g, w, h) {
  const W1 = w + 1, S = new Float64Array(W1 * (h + 1)), Q = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      rs += v; rq += v * v;
      const i = (y + 1) * W1 + x + 1;
      S[i] = S[i - W1] + rs;
      Q[i] = Q[i - W1] + rq;
    }
  }
  return { S, Q, W1 };
}

/* ---------- 템플릿 ---------- */
/** 가운데 절반(숫자 자리)을 뺀 링 모양 마스크 템플릿 */
export function makeTemplateGray(g, w, h, valid = null, whole = false) {
  const full=whole===true,cooldown=whole==='cooldown',wideTimer=whole==='wide-timer',minuteTimer=whole==='minute-timer';
  const x0=full||cooldown||wideTimer||minuteTimer?0:Math.floor(w/8),x1=full?0:cooldown?Math.ceil(w*.75):w-x0,
    y0=full?0:minuteTimer?Math.floor(h*.55):cooldown?Math.floor(h*.25):Math.floor(h/4),
    y1=full?0:cooldown||minuteTimer?h:Math.ceil(h*.72);
  const dx = [], dy = [], val = [], exx = [], exy = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      if (valid && !valid[y * w + x]) { exx.push(x); exy.push(y); continue; }   // 가려져서 쓸 수 없는 픽셀(알파 0)은 뺀다
      dx.push(x); dy.push(y); val.push(g[y * w + x]);
    }
  }
  const n = val.length;
  let mean = 0; for (const v of val) mean += v; mean /= n;
  const tz = new Float32Array(n); let ss = 0;
  for (let i = 0; i < n; i++) { tz[i] = val[i] - mean; ss += tz[i] * tz[i]; }
  return { w, h, n, dx: Int32Array.from(dx), dy: Int32Array.from(dy), tz, tnorm: Math.sqrt(ss), hole: [x0, y0, x1 - x0, y1 - y0], offW: 0, off: null,
    exN: exx.length, exDx: Int32Array.from(exx), exDy: Int32Array.from(exy), exOffW: 0, exOff: null };
}

/** rgba(등록된 아이콘) → { full: 원본 해상도 템플릿, half: 절반 해상도 템플릿 } */
export function makeTemplate(rgba, w, h, whole = false) {
  const g = toGray(rgba, w, h), hv = halve(g, w, h);
  // 알파가 0인 픽셀은 비교에서 뺀다 (예: 스크린샷에 펜 자국이 덮인 부분)
  const valid = new Uint8Array(w * h).fill(1);
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3] < 128) valid[i] = 0;
  const v2 = new Uint8Array(hv.w * hv.h);
  for (let y = 0; y < hv.h; y++) for (let x = 0; x < hv.w; x++) {
    const i = y * 2 * w + x * 2;
    v2[y * hv.w + x] = valid[i] & valid[i + 1] & valid[i + w] & valid[i + w + 1];
  }
  return { rgba, w, h, full: makeTemplateGray(g, w, h, valid, whole), half: makeTemplateGray(hv.g, hv.w, hv.h, v2, whole), corner: makeCorner(g, w, valid) };
}

/* 왼쪽 위 모서리 10x10: 스킬창 아이콘에는 키 번호 칸이 있고 버프창 아이콘에는 없다 */
function makeCorner(g, w, valid = null) {
  const CORNER = Math.max(6, Math.round(w * 10 / 32));
  if (valid) for (let y = 0; y < CORNER; y++) for (let x = 0; x < CORNER; x++) if (!valid[(y + 1) * w + x + 1]) return null;
  const v = new Float32Array(CORNER * CORNER); let m = 0;
  for (let y = 0; y < CORNER; y++) for (let x = 0; x < CORNER; x++) { v[y * CORNER + x] = g[(y + 1) * w + x + 1]; m += v[y * CORNER + x]; }
  m /= v.length; let ss = 0;
  for (let i = 0; i < v.length; i++) { v[i] -= m; ss += v[i] * v[i]; }
  return { v, norm: Math.sqrt(ss), size: CORNER };
}
function cornerScore(F, c, x, y) {
  const CORNER = c.size;
  if (x < 0 || y < 0 || x + CORNER + 1 > F.w || y + CORNER + 1 > F.h) return -1;
  let m = 0;
  for (let j = 0; j < CORNER; j++) for (let i = 0; i < CORNER; i++) m += F.G[(y + 1 + j) * F.w + x + 1 + i];
  m /= CORNER * CORNER;
  let dot = 0, ss = 0;
  for (let j = 0; j < CORNER; j++) for (let i = 0; i < CORNER; i++) { const d = F.G[(y + 1 + j) * F.w + x + 1 + i] - m; dot += d * c.v[j * CORNER + i]; ss += d * d; }
  return ss < 1e-3 || c.norm < 1e-3 ? 0 : dot / (Math.sqrt(ss) * c.norm);
}

function offsets(t, W) {
  if (t.offW !== W) {
    t.off = new Int32Array(t.n);
    for (let i = 0; i < t.n; i++) t.off[i] = t.dy[i] * W + t.dx[i];
    t.offW = W;
  }
  return t.off;
}

/** 링 안에서 빠진(무시하는) 픽셀들의 오프셋 — 1차 후보 거르기의 합계에서 이만큼을 빼준다 */
function exOffsets(t, W) {
  if (t.exOffW !== W) {
    t.exOff = new Int32Array(t.exN);
    for (let i = 0; i < t.exN; i++) t.exOff[i] = t.exDy[i] * W + t.exDx[i];
    t.exOffW = W;
  }
  return t.exOff;
}

/* ---------- 비교 ---------- */
/** (x,y)에 놓인 템플릿과 이미지의 ZNCC (-1 ~ 1) */
export function zncc(G, W, H, t, x, y) {
  if (x < 0 || y < 0 || x + t.w > W || y + t.h > H) return -1;
  const off = offsets(t, W), base = y * W + x;
  let sv = 0, svv = 0, dot = 0;
  for (let i = 0; i < t.n; i++) {
    const v = G[base + off[i]];
    sv += v; svv += v * v; dot += v * t.tz[i];
  }
  const varv = svv - sv * sv / t.n;
  if (varv < 1e-3 || t.tnorm < 1e-3) return 0;
  return dot / (Math.sqrt(varv) * t.tnorm);
}

/** 절반 해상도 전체 탐색: 점수가 minScore 이상인 겹치지 않는 후보를 점수순으로 반환 */
function coarse(H2, tc, minScore, maxCands) {
  const { g, w, h } = H2.img, { S, Q, W1 } = H2.ii;
  const off = offsets(tc, w), hx = tc.hole[0], hy = tc.hole[1], hw = tc.hole[2], hh = tc.hole[3];
  const n = tc.n, hits = [], exN = tc.exN, eo = exOffsets(tc, w);
  const sum = (A, x, y, rw, rh) => A[(y + rh) * W1 + x + rw] - A[y * W1 + x + rw] - A[(y + rh) * W1 + x] + A[y * W1 + x];
  for (let y = 0; y + tc.h <= h; y++) {
    for (let x = 0; x + tc.w <= w; x++) {
      let sv = sum(S, x, y, tc.w, tc.h) - sum(S, x + hx, y + hy, hw, hh);
      let svv = sum(Q, x, y, tc.w, tc.h) - sum(Q, x + hx, y + hy, hw, hh);
      const base = y * w + x;
      for (let k = 0; k < exN; k++) { const v = g[base + eo[k]]; sv -= v; svv -= v * v; }   // 무시하는 픽셀은 합계에서 제외
      const varv = svv - sv * sv / n;
      if (varv < 25 * n) continue;                       // 거의 평평한 곳(하늘 등)은 건너뜀
      let dot = 0;
      for (let i = 0; i < n; i++) dot += g[base + off[i]] * tc.tz[i];
      const s = dot / (Math.sqrt(varv) * tc.tnorm);
      if (s >= minScore) hits.push({ x, y, s });
    }
  }
  hits.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const c of hits) {
    if (picked.every(p => Math.abs(p.x - c.x) > 6 || Math.abs(p.y - c.y) > 6)) picked.push(c);
    if (picked.length >= maxCands) break;
  }
  return picked;
}

/* ---------- 프레임 단위 분석 ---------- */
/** 한 프레임에서 공통으로 쓰는 준비물(회색조, 절반 해상도, 합계 이미지)을 만든다 */
export function prepareFrame(rgba, w, h) {
  let gray;
  return { rgba, w, h, get G() { return gray ??= toGray(rgba,w,h); }, _half: null };
}
function half2(F) {
  if (!F._half) {
    const img = halve(F.G, F.w, F.h);
    F._half = { img, ii: integral(img.g, img.w, img.h) };
  }
  return F._half;
}

/** 직전 위치 근처만 확인 (빠름). 가장 높은 점수와 위치 */
export function trackNear(F, t, px, py, r = 3) {
  let best = { s: -1, x: px, y: py };
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const s = zncc(F.G, F.w, F.h, t.full, px + dx, py + dy);
    if (s > best.s) best = { s, x: px + dx, y: py + dy };
  }
  return best;
}

/** 화면 전체 탐색. 정밀 확인까지 끝낸 후보를 점수순으로 반환 */
export function scanAll(F, t, { coarseMin = 0.5, maxCands = 6 } = {}) {
  const H2 = half2(F);
  const out = [];
  for (const c of coarse(H2, t.half, coarseMin, maxCands)) {
    let best = { s: -1, x: 0, y: 0 };
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = c.x * 2 + dx, y = c.y * 2 + dy, s = zncc(F.G, F.w, F.h, t.full, x, y);
      if (s > best.s) best = { s, x, y };
    }
    out.push(best);
  }
  return out.sort((a, b) => b.s - a.s);
}

/** 아이콘 안쪽(숫자 자리)의 노란 픽셀 수 */
export function countYellow(F, x, y, size = ICON) {
  const x0 = x + (size >> 3), x1 = x + size - (size >> 3), y0 = y + (size * 6 >> 5), y1 = y + size - (size * 6 >> 5);
  let n = 0;
  for (let yy = Math.max(0, y0); yy < Math.min(F.h, y1); yy++) {
    for (let xx = Math.max(0, x0); xx < Math.min(F.w, x1); xx++) {
      const p = (yy * F.w + xx) * 4, d = F.rgba;
      if (d[p] > 200 && d[p + 1] > 170 && d[p + 2] < 90) n++;
    }
  }
  return n;
}

/** 작은 룬 표식은 반해상도 후보 검색에서 모양이 소실되므로 원본 색상 군집에서 찾는다. */
export function scanMarker(F,t) {
  if(!F._markerCenters){
    const seen=new Uint8Array(F.w*F.h),mask=new Uint8Array(F.w*F.h),centers=[];
    for(let i=0;i<mask.length;i++){
      const p=i*4,r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2];
      mask[i]=r>105&&b>125&&g<Math.min(r,b)*.86&&b>=r*.86?1:0;
    }
    for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
      const queue=[i];seen[i]=1;let minX=F.w,maxX=0,minY=F.h,maxY=0;
      for(let j=0;j<queue.length;j++){
        const k=queue[j],x=k%F.w,y=Math.floor(k/F.w);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
          const xx=x+dx,yy=y+dy;if(xx<0||xx>=F.w||yy<0||yy>=F.h)continue;
          const n=yy*F.w+xx;if(mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}
        }
      }
      const w=maxX-minX+1,h=maxY-minY+1;
      if(queue.length>=4&&w>=3&&h>=3&&w<=28&&h<=28)centers.push({x:(minX+maxX)/2,y:(minY+maxY)/2,w,h});
    }
    F._markerCenters=centers;
  }
  return F._markerCenters.filter(c=>c.w>=t.w*.18&&c.h>=t.h*.18&&c.w<=t.w&&c.h<=t.h)
    .map(c=>trackNear(F,t,Math.round(c.x-(t.w-1)/2),Math.round(c.y-(t.h-1)/2),3)).sort((a,b)=>b.s-a.s);
}

/** 한 대상 판정.
 *  target = { thr, main, reject? , last: {x,y}|null }  →  { found, score, x, y, yellow, mode, rejected } */
export function detect(F, target, { allowScan = true, trackRadius = 3 } = {}) {
  const { main, reject, thr } = target;
  const accept = (c, need = thr) => {
    if (c.s < need) return false;
    if (target.acceptPosition && !target.acceptPosition(c.x,c.y,main.w)) return false;
    if (target.colorMode) {
      c.chroma = iconChroma(F, main, c.x, c.y);
      const coloredRune = c.chroma.blue >= .30 && c.chroma.mean >= .14;
      if ((target.colorMode === 'color') !== coloredRune) return false;
    }
    c.color = colorSimilarity(F, main, c.x, c.y);
    if (c.color < (target.minColor ?? .72)) return false;
    if (reject && zncc(F.G, F.w, F.h, reject.full, c.x, c.y) > c.s + 0.025) return false;
    // 모서리가 버프 아이콘보다 스킬창 아이콘(키 번호 칸)에 확실히 더 가까우면 스킬창으로 보고 제외
    if (reject?.corner && main.corner && cornerScore(F, reject.corner, c.x, c.y) > cornerScore(F, main.corner, c.x, c.y) + 0.1) return false;
    return true;
  };
  let best = { s: -1, x: 0, y: 0 }, mode = 'track', rejected = false;

  if (target.last) {
    const c = trackNear(F, main, target.last.x, target.last.y, trackRadius);
    best = c;
    // 이미 찾은 자리를 따라갈 때는 기준을 조금 낮춘다 (시간이 갈수록 아이콘이 흐려져서 점수가 떨어지기 때문)
    if (accept(c, thr - (target.minColor ? 0 : TRACK_SLACK))) return done(F, c, 'track', false, main,target.readTimer);
  }
  if (!allowScan) return { found: false, score: Math.max(0, best.s), x: best.x, y: best.y, yellow: 0, mode: 'wait', rejected: false };

  mode = 'scan';
  for (const c of (target.marker ? scanMarker(F, main) : scanAll(F, main, target.scanOptions))) {
    if (c.s > best.s) best = c;
    if (accept(c)) return done(F, c, 'scan', false, main,target.readTimer);
    if (c.s >= thr) rejected = true;
  }
  return { found: false, score: Math.max(0, best.s), x: best.x, y: best.y, yellow: 0, mode, rejected };
}

export function iconChroma(F,t,x,y){
  let sum=0,colored=0,blue=0,count=0;
  for(let i=0;i<t.full.n;i++){
    const dx=t.full.dx[i],dy=t.full.dy[i];
    if (dx<t.w*.08 || dx>=t.w*.92 || dy<t.h*.08 || dy>=t.h*.92) continue;
    const p=((y+dy)*F.w+x+dx)*4;
    const r=F.rgba[p],g=F.rgba[p+1],b=F.rgba[p+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
    // Exclude bright yellow countdown strokes from the classification.
    if (max<65 || (r>140 && g>115 && Math.min(r,g)-b>65)) continue;
    const saturation=(max-min)/max;
    sum+=saturation;count++;if(saturation>.25)colored++;
    // Rune artwork is blue or violet. Yellow countdown strokes carry no identity.
    if (b > r + 20 && (b > g + 14 || g > r + 25)) blue++;
  }
  return {mean:count?sum/count:0,colored:count?colored/count:0,blue:count?blue/count:0};
}

// 밝기가 달라져도 유지되는 RGB 비율을 숫자 영역 밖에서 비교한다.
function colorSimilarity(F, t, x, y) {
  let error = 0, n = 0;
  for (let i = 0; i < t.full.n; i += 3) {
    const dx = t.full.dx[i], dy = t.full.dy[i];
    const a = (dy * t.w + dx) * 4, b = ((y + dy) * F.w + x + dx) * 4;
    const sa = t.rgba[a] + t.rgba[a+1] + t.rgba[a+2];
    const sb = F.rgba[b] + F.rgba[b+1] + F.rgba[b+2];
    if (sa < 75 || sb < 45) continue;
    for (let k = 0; k < 3; k++) error += Math.abs(t.rgba[a+k] / sa - F.rgba[b+k] / sb);
    n++;
  }
  return n ? 1 - error / (2 * n) : 0;
}

export function resizeIcon(img, size) {
  if (img.w === size && img.h === size) return img;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const u=Math.max(0,Math.min(img.w-1,(x+.5)*img.w/size-.5));
    const v=Math.max(0,Math.min(img.h-1,(y+.5)*img.h/size-.5));
    const left=Math.floor(u),top=Math.floor(v);
    const right=Math.min(left+1,img.w-1),bottom=Math.min(top+1,img.h-1);
    const dx=u-left,dy=v-top;
    for(let c=0;c<4;c++) {
      rgba[(y*size+x)*4+c] =
        (img.rgba[(top*img.w+left)*4+c]*(1-dx)+img.rgba[(top*img.w+right)*4+c]*dx)*(1-dy)+
        (img.rgba[(bottom*img.w+left)*4+c]*(1-dx)+img.rgba[(bottom*img.w+right)*4+c]*dx)*dy;
    }
  }
  return {rgba,w:size,h:size};
}

function done(F, c, mode, rejected, main, readTimer=true) {
  const size = main.w, yellow = countYellow(F, c.x, c.y, size);
  const preview = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const offset = ((c.y + y) * F.w + c.x) * 4;
    preview.set(F.rgba.subarray(offset, offset + size * 4), y * size * 4);
  }
  if (!readTimer) return {found:true,score:c.s,color:c.color,x:c.x,y:c.y,size,preview,mode};
  let reading;
  if (F.timerFormat!=='clock') reading=readDigits(preview,size);
  if (!reading || reading.seconds===null) {
    for (const options of [
      {area:[.02,.24,1,.79]},
      {area:[.02,.36,1,.69]},
      {area:[.02,.31,1,.73],faintYellow:true}
    ]) {
      if (options.faintYellow && F.timerFormat!=='clock') continue;
      const clock=readDigits(preview,size,{...options,clockOnly:true});
      if (clock.unit!=='seconds') continue;
      reading=clock;
      break;
    }
  }
  if (!reading && F.timerFormat==='clock') {
    const wide=readDigits(preview,size,{area:[.02,.29,1,.76],aligned:true});
    const inferred=applyTimerFormat(wide,F.timerFormat);
    if (inferred.clock) reading=inferred;
  }
  reading=applyTimerFormat(reading ?? readDigits(preview,size),F.timerFormat);
  return { found: true, identity:true, chroma:c.chroma, score: c.s, color: c.color, x: c.x, y: c.y,
    size, yellow, ...reading, preview, mode, rejected };
}

/* ---------- 등록 화면용: 클릭한 곳을 포함하는 아이콘 테두리 찾기 ---------- */
/** img: {data,width,height}. 검은 1px 테두리가 가장 뚜렷한 32x32 박스를 찾는다. */
export function snapIconBox(img, cx, cy, size = ICON) {
  const { data, width: W, height: H } = img;
  const dark = (x, y) => { const p = (y * W + x) * 4; return data[p] + data[p + 1] + data[p + 2] < 90; };
  let best = { x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), dark: -1 };
  for (let y = cy - size + 1; y <= cy; y++) {
    for (let x = cx - size + 1; x <= cx; x++) {
      if (x < 0 || y < 0 || x + size > W || y + size > H) continue;
      let d = 0;
      for (let i = 2; i < size - 2; i++) {            // 둥근 모서리는 제외
        d += dark(x + i, y) + dark(x + i, y + size - 1) + dark(x, y + i) + dark(x + size - 1, y + i);
      }
      if (d > best.dark) best = { x, y, dark: d };
    }
  }
  best.ratio = best.dark / (4 * (size - 4));           // 1이면 테두리가 완벽히 검은색
  return best;
}
