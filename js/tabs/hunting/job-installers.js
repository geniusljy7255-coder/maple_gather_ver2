const files = [
  "라라_강줄기_흐르는_곳",
  "섀도어_다크_플레어",
  "섀도어_다크_플레어_6차",
  "은월_소혼_장막",
  "은월_소혼_장막_6차",
  "칼리_데스_블로섬",
  "칼리_데스_블로섬_6차",
  "캡틴_배틀쉽_봄버",
  "캡틴_배틀쉽_봄버_6차",
  "캡틴_시즈_봄버",
  "캡틴_시즈_봄버_6차",
  "호영_흡성와류",
  "호영_흡성와류_6차"
];
export const installerIcon = file => new URL('../../../icon/hunting/' + encodeURIComponent(file) + '.png', import.meta.url).href;

export const jobSkills = [...new Set(files.map(file => file.replace(/_6차$/, '')))].map(id => {
  const [job, ...skill] = id.split('_');
  return {id, label: job + ' - ' + skill.join(' '), normal: files.includes(id), sixth: files.includes(id + '_6차')};
});

const key = 'hunt_job_installers';
const listeners = new Set();
export let jobInstallers = [];
try {
  const saved = JSON.parse(localStorage.getItem(key) || '[]');
  if (Array.isArray(saved)) jobInstallers = saved.filter(item => item && /^job-\d+$/.test(item.id)).slice(0, 12);
} catch {}

export const onJobInstallersChange = listener => listeners.add(listener);
export const jobSkill = item => jobSkills.find(skill => skill.id === item.skill);
const alertNames={
  라라_강줄기_흐르는_곳:'강줄기',
  섀도어_다크_플레어:'플레어',
  은월_소혼_장막:'소혼장막',
  칼리_데스_블로섬:'블로섬',
  캡틴_배틀쉽_봄버:'배틀쉽',
  캡틴_시즈_봄버:'시즈봄버',
  호영_흡성와류:'흡성와류'
};
export function jobAlarm(item) {
  const skill=jobSkill(item);
  if (!skill) return null;
  return {id:item.id+':'+skill.id,label:alertNames[skill.id] ?? skill.label};
}
export function jobIconFile(item) {
  const skill = jobSkill(item);
  if (!skill) return null;
  return item.sixth && skill.sixth || !skill.normal ? skill.id + '_6차' : skill.id;
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(jobInstallers)); } catch {}
  listeners.forEach(listener => listener());
}
export function addJobInstaller() {
  if (jobInstallers.length >= 12) return;
  let id = 1;
  while (jobInstallers.some(item => item.id === 'job-' + id)) id++;
  jobInstallers.push({id:'job-' + id, skill:'', sixth:false});
  save();
}
export function updateJobInstaller(id, changes) {
  const item = jobInstallers.find(item => item.id === id);
  if (!item) return;
  Object.assign(item, changes);
  const skill = jobSkill(item);
  item.sixth = Boolean(skill?.sixth && (item.sixth || !skill.normal));
  save();
}
export function removeJobInstaller(id) {
  jobInstallers = jobInstallers.filter(item => item.id !== id);
  save();
}
