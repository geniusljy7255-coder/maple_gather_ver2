/* localStorage 헬퍼 */
export const readJSON = (key, fallback = {}) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
