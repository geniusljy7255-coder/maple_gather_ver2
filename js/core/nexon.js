export const nexonApi = key => path => fetch('https://open.api.nexon.com/maplestory/v1/'+path,{
  headers:{'x-nxopen-api-key':key}
});

export async function fetchCharacterAppearance(name,key){
  const api=nexonApi(key);
  const idResponse=await api('id?'+new URLSearchParams({character_name:name}));
  const id=await idResponse.json();
  if (!idResponse.ok || !id.ocid) throw new Error('캐릭터를 찾지 못했어. 닉네임과 API 키를 확인해 줘.');
  const response=await api('character/basic?'+new URLSearchParams({ocid:id.ocid}));
  const basic=await response.json();
  if (!response.ok || !basic.character_image) throw new Error('캐릭터 외형을 불러오지 못했어.');
  return {name:basic.character_name || name,image:basic.character_image};
}
