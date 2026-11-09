'use strict';
(()=>{
  const icons={
    camera:'<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    live:'<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 22h8m-4-4v4"/><path d="m10 8 5 3-5 3Z"/>',
    sets:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M7 3h10M6 11h4v6H6zm8 0h4v6h-4z"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    back:'<path d="m10 5-7 7 7 7M3 12h18"/>',
    chevron:'<path d="m7 9 5 5 5-5"/>',
    right:'<path d="m9 5 7 7-7 7"/>',
    left:'<path d="m15 5-7 7 7 7"/>',
    up:'<path d="m5 15 7-7 7 7"/>',
    down:'<path d="m5 9 7 7 7-7"/>',
    close:'<path d="m5 5 14 14M5 19 19 5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    plus:'<path d="M12 4v16M4 12h16"/>',
    edit:'<path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14Z"/>',
    save:'<path d="M4 4h13l3 3v13H4Zm4 0v6h8V4M8 20v-6h8v6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  icons.retry='<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>';
  icons.archive='<path d="M4 4h16v5H4zm2 5v11h12V9M9 13h6"/>';
  const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.camera)+'</svg>';
  const layoutIcon=number=>{
    const columns=number===1?1:number===6?3:2, rows=number>2?2:1, gap=2, w=(20-gap*(columns-1))/columns, h=(16-gap*(rows-1))/rows;
    let rectangles='';for(let index=0;index<number;index++)rectangles+=`<rect x="${2+(index%columns)*(w+gap)}" y="${4+Math.floor(index/columns)*(h+gap)}" width="${w}" height="${h}" rx=".6"/>`;
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'+rectangles+'</svg>';
  };
window.ViewerIcons={icon,layoutIcon};
})();
