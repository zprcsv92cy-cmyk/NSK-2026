// Shared portrait hockey rink visualization and predefined drill diagrams.
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const C={red:'#b11226',blue:'#2563eb',black:'#111827',green:'#17844b'};
  const node=(name,attrs,parent)=>{
    const element=document.createElementNS(NS,name);
    for(const [k,v]of Object.entries(attrs))element.setAttribute(k,String(v));
    parent.append(element);return element;
  };
  const m=(type,x,y,x2,y2,color)=>({type,x,y,x2,y2,color});
  // These are editorially drawn example diagrams, not generated from the prose description.
  const diagrams=[
    [m('cone',135,655),m('cone',200,575),m('cone',290,510),m('cone',340,410),m('player',135,715,0,0,C.red),m('skate',135,710,195,580,C.green),m('skate',195,580,300,510,C.green),m('skate',300,510,350,405,C.green),m('skate',350,405,270,305,C.green)],
    [m('player',115,700,0,0,C.red),m('puck',135,680),m('cone',180,630),m('cone',295,565),m('cone',180,500),m('cone',295,430),m('cone',180,365),m('skate',135,680,220,630,C.green),m('skate',220,630,250,560,C.green),m('skate',250,560,215,490,C.green),m('skate',215,490,265,430,C.green),m('skate',265,430,220,365,C.green)],
    [m('player',115,635,0,0,C.red),m('player',115,680,0,0,C.red),m('player',365,515,0,0,C.blue),m('player',365,560,0,0,C.blue),m('puck',140,635),m('pass',155,635,325,520,C.blue),m('skate',115,635,345,555,C.green),m('skate',365,520,365,470,C.green)],
    [m('player',138,355,0,0,C.red),m('player',340,350,0,0,C.blue),m('puck',158,345),m('puck',322,345),m('cone',130,310),m('cone',346,310),m('pass',150,345,220,125,C.blue),m('pass',332,345,255,125,C.blue),m('goalie',240,105,0,0,C.black)],
    [m('divider',65,300,65,600),m('divider',415,300,415,600),m('player',145,375,0,0,C.red),m('player',150,490,0,0,C.red),m('player',330,375,0,0,C.blue),m('player',320,490,0,0,C.blue),m('puck',245,425),m('skate',150,375,230,430,C.green),m('skate',325,490,265,430,C.green),m('cone',240,315),m('cone',240,565)],
    [m('goalie',240,135,0,0,C.black),m('cone',188,145),m('cone',292,145),m('player',165,365,0,0,C.red),m('puck',182,355),m('player',322,365,0,0,C.blue),m('puck',302,355),m('skate',240,135,190,145,C.green),m('skate',190,145,285,145,C.green),m('pass',185,350,235,165,C.blue),m('pass',305,350,250,165,C.blue)],
    [m('player',105,670,0,0,C.red),m('player',370,670,0,0,C.blue),m('cone',105,590),m('cone',370,590),m('cone',105,445),m('cone',370,445),m('cone',105,300),m('cone',370,300),m('skate',105,660,105,460,C.green),m('skate',105,460,105,295,C.green),m('skate',370,660,370,460,C.green),m('skate',370,460,370,295,C.green)],
    [m('player',80,640,0,0,C.red),m('player',165,525,0,0,C.blue),m('puck',99,618),m('cone',60,565),m('cone',60,440),m('cone',60,350),m('skate',90,620,105,500,C.green),m('skate',105,500,75,380,C.green),m('skate',175,525,110,455,C.blue)],
    [m('player',365,625,0,0,C.red),m('puck',155,435),m('cone',365,570),m('cone',320,485),m('cone',235,390),m('skate',365,610,165,445,C.green),m('skate',165,445,320,590,C.green),m('player',322,610,0,0,C.blue),m('pass',175,445,305,590,C.blue)],
    [m('player',130,615,0,0,C.red),m('player',240,490,0,0,C.blue),m('player',350,370,0,0,C.red),m('puck',155,600),m('pass',150,600,225,500,C.blue),m('pass',255,475,335,390,C.blue),m('pass',350,355,250,130,C.blue),m('skate',130,615,225,515,C.green),m('skate',240,490,345,380,C.green),m('goalie',240,104,0,0,C.black)]
  ];
  function render(svg,items){
    svg.replaceChildren();
    svg.setAttribute('viewBox','0 0 480 860');
    svg.setAttribute('xmlns',NS);
    node('rect',{width:480,height:860,fill:'#fff'},svg);
    node('rect',{x:13,y:10,width:454,height:840,rx:84,fill:'#fff',stroke:'#5b6470','stroke-width':6},svg);
    for(const y of [90,770])node('line',{x1:22,y1:y,x2:458,y2:y,stroke:'#ca263a','stroke-width':4},svg);
    for(const y of [270,590])node('line',{x1:20,y1:y,x2:460,y2:y,stroke:'#2767be','stroke-width':7},svg);
    node('line',{x1:18,y1:430,x2:462,y2:430,stroke:'#ca263a','stroke-width':4},svg);
    node('circle',{cx:240,cy:430,r:65,stroke:'#ca263a',fill:'none','stroke-width':3},svg);
    node('circle',{cx:240,cy:430,r:5,fill:'#2767be'},svg);
    for(const y of [174,686])for(const x of [132,348]){
      node('circle',{cx:x,cy:y,r:57,fill:'none',stroke:'#ca263a','stroke-width':3},svg);
      node('circle',{cx:x,cy:y,r:4,fill:'#ca263a'},svg);
    }
    for(const y of [41,819]){
      node('rect',{x:207,y:y-10,width:66,height:19,rx:3,fill:'#dff2fd',stroke:'#b11226','stroke-width':3},svg);
      node('path',{d:y<430?'M 195 90 Q 240 145 285 90':'M 195 770 Q 240 715 285 770',fill:'none',stroke:'#55a8df','stroke-width':2},svg);
    }
    const defs=node('defs',{},svg);
    for(const [key,c]of Object.entries(C)){
      const marker=node('marker',{id:'exercise-arrow-'+key,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'},defs);
      node('path',{d:'M 1 1 L 9 5 L 1 9',stroke:c,'stroke-width':2,fill:'none'},marker);
    }
    for(const mark of items){
      const type=mark.type, color=mark.color||C.red;
      if(type==='player'||type==='goalie'){
        node('circle',{cx:mark.x,cy:mark.y,r:type==='goalie'?18:14,fill:color,stroke:'#fff','stroke-width':3},svg);
        if(type==='goalie')node('circle',{cx:mark.x,cy:mark.y,r:7,fill:'#fff'},svg);
      }else if(type==='puck')node('ellipse',{cx:mark.x,cy:mark.y,rx:9,ry:6,fill:'#151515',stroke:'#fff','stroke-width':2},svg);
      else if(type==='cone')node('polygon',{points:mark.x+','+(mark.y-14)+' '+(mark.x-12)+','+(mark.y+10)+' '+(mark.x+12)+','+(mark.y+10),fill:'#ec8516',stroke:'#a65a0b','stroke-width':2},svg);
      else if(['skate','pass','divider'].includes(type)){
        const colorKey=Object.keys(C).find(k=>C[k]===color)||'green';
        const props={x1:mark.x,y1:mark.y,x2:mark.x2,y2:mark.y2,stroke:type==='divider'?'#e9871a':color,'stroke-width':type==='divider'?7:4,'stroke-linecap':'round'};
        if(type==='pass')props['stroke-dasharray']='10 9';
        if(type!=='divider')props['marker-end']='url(#exercise-arrow-'+colorKey+')';
        node('line',props,svg);
      }
    }
    return svg;
  }
  window.NskExerciseRink={render,diagram:index=>diagrams[index]||[],count:diagrams.length};
})();