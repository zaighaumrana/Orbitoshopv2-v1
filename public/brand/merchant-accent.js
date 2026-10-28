/* Shared by the built app and standalone tracker. Saved tenant colors are never rewritten. */
(() => {
  const rgb = hex => [0,2,4].map(i => parseInt(hex.slice(i,i+2),16));
  const luminance = color => color.map(n => n/255).map(n => n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);
  const contrast = (a,b) => { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const hex = color => '#'+color.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
  function derive(value, theme='light') {
    const dark=theme==='dark',surface=rgb(dark?'151e36':'ffffff'),fallback=rgb(dark?'a4b7ff':'2548d8');
    let source=String(value||'').trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
    if(source?.length===3)source=[...source].map(x=>x+x).join('');
    const alpha=source?.length===8?parseInt(source.slice(6),16)/255:1;
    let color=source?rgb(source.slice(0,6)).map((n,i)=>n*alpha+surface[i]*(1-alpha)):fallback;
    // Text/accent against its surface must remain readable, even for white/yellow/cyan.
    for(let i=0;i<24&&contrast(color,surface)<4.5;i++)color=color.map((n,j)=>n*.85+fallback[j]*.15);
    if(contrast(color,surface)<4.5)color=fallback;
    const black=rgb('0b1228'),white=rgb('ffffff'),on=contrast(color,white)>=contrast(color,black)?white:black;
    return {accent:hex(color),on:hex(on),soft:hex(color.map((n,i)=>n*.10+surface[i]*.90))};
  }
  globalThis.RetraSellBrand=Object.freeze({derive,contrast});
})();
