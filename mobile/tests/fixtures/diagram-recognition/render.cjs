// Synthetic fixture renderer only. Expected annotations live independently in JSON.
exports.render=function(sample){
 const w=sample.width,h=sample.height,rgba=new Uint8ClampedArray(w*h*4);rgba.fill(255);
 function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 for(const p of sample.primitives){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let hit=false;
   if(p.kind==='rect')hit=x>=p.x&&x<p.x+p.width&&y>=p.y&&y<p.y+p.height&&(p.fill||x<p.x+p.stroke||x>=p.x+p.width-p.stroke||y<p.y+p.stroke||y>=p.y+p.height-p.stroke);
   if(p.kind==='circle'){const r=Math.hypot(x-p.x,y-p.y);hit=r<=p.radius&&(p.fill||r>=p.radius-p.stroke);}
   if(p.kind==='polygon')hit=inside(x+.5,y+.5,p.points);
   if(p.kind==='line'){const dx=p.b[0]-p.a[0],dy=p.b[1]-p.a[1],t=Math.max(0,Math.min(1,((x-p.a[0])*dx+(y-p.a[1])*dy)/(dx*dx+dy*dy)));hit=Math.hypot(x-p.a[0]-t*dx,y-p.a[1]-t*dy)<=p.stroke/2;}
   if(p.kind==='grid')hit=x%p.spacing===0||y%p.spacing===0;
   if(hit){const i=(y*w+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=p.gray??0;rgba[i+3]=255;}
  }
 }
 return {width:w,height:h,rgba};
};
