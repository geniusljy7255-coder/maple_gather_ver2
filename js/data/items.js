/* 제작 계산기 데이터: 아이템 시세 · 제작 카드 정의 */
// g: 0=제작 결과물, 1=재료, 2=고정가(fixed=[기본가, 길드가입가])
const ITEMS = [
  { g: 0, id: 'oilPrice',                  name: '쥬니퍼베리 씨앗 오일',          icon: '쥬니퍼베리씨앗오일',   price: '5,000,000' },
  { g: 0, id: 'potionPrice',               name: '소형 재물 획득의 비약',         icon: '재물획득의비약',       price: '4,400,000' },
  { g: 0, id: 't2SmallHighExpPotionPrice', name: '소형 고농축 경험 축적의 비약',  icon: '고농축경험축적의비약', price: '5,600,000' },
  { g: 0, id: 't2HeroPotionPrice',         name: '대영웅의 비약',                 icon: '대영웅의비약',         price: '290,000' },
  { g: 0, id: 't2AdvHeroPotionPrice',      name: '고급 대영웅의 비약',            icon: '고급대영웅의비약',     price: '4,500,000' },
  { g: 0, id: 'legendPotionPrice',          name: '전설의 영웅 비약',              icon: '전설의영웅비약',       price: '1,300,000' },
  { g: 0, id: 'stonePrice',                name: '마법의 숫돌',                   icon: '마법의숫돌',           price: '4,100,000' },
  { g: 1, id: 'seedPrice',                 name: '쥬니퍼베리 씨앗',               icon: '쥬니퍼베리씨앗',       price: '730,000' },
  { g: 1, id: 't2SmallExpPotionPrice',     name: '소형 경험 축적의 비약',         icon: '경험축적의비약',       price: '1,000,000' },
  { g: 1, id: 't2ShiningTwilightPrice',    name: '영롱한 황혼의 정수',            icon: '영롱한황혼의정수',     price: '7,100,000' },
  { g: 1, id: 't2TwilightPrice',           name: '황혼의 정수',                   icon: '황혼의정수',           price: '14,000' },
  { g: 1, id: 't2HyssopFlowerPrice',       name: '히솝 꽃',                       icon: '히솝꽃',               price: '1,100' },
  { g: 1, id: 'hyssopOilPrice',            name: '히솝 꽃 오일',                  icon: '히솝꽃오일',           price: '8,700' },
  { g: 1, id: 'juniFlowerPrice',            name: '쥬니퍼베리 꽃',                 icon: '쥬니퍼베리꽃',         price: '2,000' },
  { g: 1, id: 'juniFlowerOilPrice',         name: '쥬니퍼베리 꽃 오일',            icon: '쥬니퍼베리꽃오일',     price: '30,000' },
  { g: 1, id: 'potionRecipePrice',          name: '재물 획득의 비약 레시피',       icon: '레시피',               price: '7,000,000' },
  { g: 1, id: 'highExpRecipePrice',         name: '소형 고농축 경험 축적의 비약 레시피', icon: '레시피',          price: '10,000' },
  { g: 1, id: 'legendRecipePrice',          name: '전설의 영웅 비약 레시피',       icon: '레시피',               price: '270,000,000' },
  { g: 1, id: 'crystalPrice',              name: '최상급 아이템 결정',            icon: '최상급아이템결정',     price: '280,000' },
  { g: 1, id: 't2AdvSpellPrice',           name: '상급 주문의 정수',              icon: '상급주문의정수',       price: '78,000' },
  { g: 1, id: 't2MagicCrystalPrice',       name: '마력 결정',                     icon: '마력결정',             price: '50' },
  { g: 1, id: 't2TwistedTimePrice',        name: '뒤틀린 시간의 정수',            icon: '뒤틀린시간의정수',     price: '8,400' },
  { g: 1, id: 'recipePrice',               name: '현자의 돌',                     icon: '현자의돌',             price: '5,000' },
  { g: 2, id: 'herbOilPrice',              name: '최고급 허브오일병',             icon: '최고급허브오일병',       fixed: [1000, 960] },
  { g: 2, id: 'bottlePrice',               name: '최고급 포션 빈 병',             icon: '최고급포션빈병',       fixed: [800, 768] },
  { g: 2, id: 'toolPrice',                 name: '채집 도구 (500피로도당)',       icon: '채집도구',             fixed: [100000000, 96000000] }
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const GROUP_TITLES = ['제작 결과물 시세', '재료 시세', '고정가 (길드 가입 시 할인 적용)'];

// 제작 카드 정의. sec: 섹션 번호, mats: {재료 id: 1회 필요 수량}
// (oilG, potionG는 "하루 피로도로 씨앗을 채집"하는 전용 계산)
const SECTION_TITLES = ['쥬니퍼베리 씨앗', '영롱한 황혼의 정수', '기타'];
// flower: 씨앗을 캐다 보면 함께 나오는 꽃(보유 수량 기준)으로 만드는 오일 카드
// once: 1일 1회만 필요한 재료 (제작 횟수가 1회 이상이면 한 번만 포함)
const CARDS = [
  { sec: 0, id: 'seedSell', out: 'seedPrice', title: '쥬니퍼베리 씨앗', desc: '채집한 씨앗을 그대로 판매' },
  { sec: 0, id: 'oilG',    out: 'oilPrice',    title: '쥬니퍼베리 씨앗 오일', desc: '씨앗 채집 후 부캐 제작 (성공률 90%)' },
  { sec: 0, id: 'potionG', out: 'potionPrice', title: '소형 재물 획득의 비약 (채집후 제작한 오일(나머지 구매))', desc: '1회: 피로도 5 → 6개' },
  { sec: 0, id: 'potion',  out: 'potionPrice', title: '소형 재물 획득의 비약 (오일 구매)', yield: 6, fatigue: 5, mats: { bottlePrice: 1, oilPrice: 5, crystalPrice: 2, recipePrice: 1 }, once: { potionRecipePrice: 1 } },
  { sec: 1, id: 'shiningSell', out: 't2ShiningTwilightPrice', title: '영롱한 황혼의 정수 (보유 수량 판매)', desc: '보유 중인 수량 기준' },
  { sec: 1, id: 'hyssopOil', out: 'hyssopOilPrice', flower: 't2HyssopFlowerPrice', title: '히솝 꽃 오일', desc: '채집 후 부캐 제작 (성공률 90%)' },
  { sec: 1, id: 'highexp', out: 't2SmallHighExpPotionPrice', yield: 4, fatigue: 5,  mats: { t2SmallExpPotionPrice: 4, t2ShiningTwilightPrice: 2, hyssopOilPrice: 10, t2MagicCrystalPrice: 1000, highExpRecipePrice: 1 } },
  { sec: 1, id: 'advheroSelf', out: 't2AdvHeroPotionPrice', title: '고급 대영웅의 비약 (대영웅 직접 제작)', desc: '1회: 피로도 12.5 → 2개 (대영웅 제작 포함)' },
  { sec: 1, id: 'advhero', out: 't2AdvHeroPotionPrice', title: '고급 대영웅의 비약 (대영웅 구매)', yield: 2, fatigue: 10, mats: { t2HeroPotionPrice: 1, hyssopOilPrice: 10, t2AdvSpellPrice: 1, t2ShiningTwilightPrice: 1 } },
  { sec: 2, id: 'juniOil', out: 'juniFlowerOilPrice', flower: 'juniFlowerPrice', title: '쥬니퍼베리 꽃 오일', desc: '채집 후 부캐 제작 (성공률 90%)' },
  { sec: 2, id: 'legend',  out: 'legendPotionPrice', yield: 3, fatigue: 5, mats: { bottlePrice: 1, juniFlowerOilPrice: 10, crystalPrice: 5, recipePrice: 2 }, once: { legendRecipePrice: 1 } },
  { sec: 2, id: 'stone',   out: 'stonePrice',                yield: 1, fatigue: 10, mats: { crystalPrice: 10, t2TwistedTimePrice: 10, t2AdvSpellPrice: 10 } }
];

// localStorage에 저장할 입력 필드 (기존 키 유지)
const INPUT_IDS = [
  'dailyFatigue',
  ...ITEMS.filter(i => !i.fixed).map(i => i.id),
  ...ITEMS.map(i => `own_${i.id}`)
];

export { ITEMS, ITEM, GROUP_TITLES, SECTION_TITLES, CARDS, INPUT_IDS };
