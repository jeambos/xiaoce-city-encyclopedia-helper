const {cities}=require('./data');

// 省会／自治区首府名单据清华大学公共管理学院《2023年中国城市政府财政透明度报告》附表核对。
// https://www.sppm.tsinghua.edu.cn/__local/5/E4/AA/C7740295314A7E69496ACBE6039_BCBAC39D_60C814.pdf
const capitalNames=[
  '石家庄市','太原市','沈阳市','长春市','哈尔滨市','南京市','杭州市','合肥市','福州市',
  '南昌市','济南市','郑州市','广州市','长沙市','武汉市','海口市','成都市','贵阳市',
  '昆明市','西安市','兰州市','西宁市','呼和浩特市','南宁市','拉萨市','银川市','乌鲁木齐市'
];
const capitalCodes=capitalNames.map(name=>{
  const matches=cities.filter(c=>c.name===name);
  if(matches.length!==1)throw new Error(`省会词库匹配异常：${name}`);
  return matches[0].code;
});
module.exports={capitalCodes};
