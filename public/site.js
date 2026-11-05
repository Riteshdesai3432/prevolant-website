(function(){
var RM=matchMedia('(prefers-reduced-motion:reduce)').matches,$=function(s){return document.querySelector(s)},A=function(s){return[].slice.call(document.querySelectorAll(s))};
var cl=function(v){return Math.max(0,Math.min(1,v))};
// giant hero word: letters reveal S-first, and the word is fitted so it is fully readable on load
var G1=$('#g1');G1.innerHTML=G1.textContent.split('').map(function(c,i){return'<span class="l" style="--i:'+i+'">'+c+'</span>'}).join('');
function fit(){G1.style.fontSize='100px';var w=G1.getBoundingClientRect().width;G1.style.fontSize=Math.min(480,100*innerWidth*.94/w)+'px'}
fit();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);addEventListener('resize',fit);
// sunburst
var r=$('#rays'),h='';for(var i=0;i<96;i++){var a=i*Math.PI*2/96,l=i%2?150:178;h+='<line x1="'+(Math.cos(a)*118).toFixed(1)+'" y1="'+(Math.sin(a)*118).toFixed(1)+'" x2="'+(Math.cos(a)*l).toFixed(1)+'" y2="'+(Math.sin(a)*l).toFixed(1)+'" stroke="#0D0F12" stroke-width="1.2"/>'}r.innerHTML=h;
// dots
var dw=$('#dots'),dots=[];for(var j=0;j<16;j++){var d=document.createElement('i');d.className='dot';d.style.left=(Math.random()*96+2)+'%';d.style.top=(Math.random()*90+5)+'%';d.dataset.z=(Math.random()*26+6).toFixed(0);dw.appendChild(d);dots.push(d)}
if(!RM)addEventListener('mousemove',function(e){var x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;dots.forEach(function(d){var z=+d.dataset.z;d.style.transform='translate('+(x*z*2)+'px,'+(y*z*2)+'px)'})});
// split headings
A('[data-split]').forEach(function(el){var t=el.textContent.trim().split(/\s+/);el.innerHTML=t.map(function(w,i){return'<span class="w"><i style="transition-delay:'+(i*.07)+'s">'+w+'</i></span> '}).join('')});
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on','in');io.unobserve(e.target)}})},{threshold:.15,rootMargin:'0px 0px -6% 0px'});
A('.rv,[data-split]').forEach(function(el){io.observe(el)});
setTimeout(function(){$('h1').classList.add('in')},150);
// tilt
A('[data-tilt]').forEach(function(el){if(RM||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;el.addEventListener('mousemove',function(e){var b=el.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;el.style.transform='perspective(900px) rotateY('+(x*8)+'deg) rotateX('+(-y*8)+'deg) scale(1.02)'});el.addEventListener('mouseleave',function(){el.style.transform=''})});
// scroll-linked
var nav=$('#nav'),bar=$('#bar'),g1=$('#g1'),g2=$('#g2'),g3=$('#g3'),mq=$('#mq'),ln=$('#ln'),st=A('.st'),ab=$('#about'),ft=$('#footer'),mqs=$('.mq'),ps=$('#ps'),tk=0;
function pr(el){var b=el.getBoundingClientRect();return cl((innerHeight-b.top)/(innerHeight+b.height))}
function upd(){tk=0;var y=scrollY,m=document.documentElement.scrollHeight-innerHeight;
bar.style.transform='scaleX('+(m>0?y/m:0)+')';nav.classList.toggle('sc',y>40);
if(RM)return;
g1.style.transform='translate(calc(-50% + '+(-y*.16)+'px),calc(-50% + '+(y*.08)+'px))';
g2.style.transform='translateX('+(30-pr(ab)*60)+'%)';
mq.style.transform='translateX('+(8-pr(mqs)*52)+'%)';
g3.style.transform='translateX('+(14-pr(ft)*24)+'%)';
var p=cl((innerHeight*.85-ps.getBoundingClientRect().top)/(ps.offsetHeight+innerHeight*.2));
ln.style.transform='scaleX('+p+')';st.forEach(function(s,i){s.classList.toggle('on',p>i/5+.03)})}
addEventListener('scroll',function(){if(!tk){tk=1;requestAnimationFrame(upd)}},{passive:true});addEventListener('resize',upd);upd();
if(RM){st.forEach(function(s){s.classList.add('on')});ln.style.transform='scaleX(1)'}
// footer badge follows cursor
var gz=$('#gz'),bg=$('#bg'),tx=0,ty=0,cx=0,cy=0,act=0;
gz.addEventListener('mousemove',function(e){var b=gz.getBoundingClientRect();tx=e.clientX-b.left-62;ty=e.clientY-b.top-62;if(!act){cx=tx;cy=ty;act=1;bg.classList.add('on');loop()}});
gz.addEventListener('mouseleave',function(){bg.classList.remove('on');act=0});
function loop(){if(!act||RM)return;cx+=(tx-cx)*.12;cy+=(ty-cy)*.12;bg.style.transform='translate('+cx+'px,'+cy+'px)';requestAnimationFrame(loop)}
var fm=$('#fm'),okEl=$('#ok'),sb=$('#sb');
fm.addEventListener('submit',function(e){e.preventDefault();okEl.className='ok';okEl.textContent='Sending…';sb.disabled=true;
var d={};new FormData(fm).forEach(function(v,k){d[k]=v});
fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),credentials:'same-origin'}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
if(x.ok){fm.reset();okEl.textContent='Thank you! Your message has been received. We will get back to you soon.';if(window.turnstile)try{turnstile.reset()}catch(_){}}
else{okEl.className='ok err';okEl.textContent=(x.j&&x.j.error)||'Something went wrong. Please try again or call us.'}}).catch(function(){okEl.className='ok err';okEl.textContent='Network error. Please try again or call us.'}).then(function(){sb.disabled=false})});
// mobile menu
var bu=$('#burger'),mn=$('#mnav');
function mset(o){mn.classList.toggle('open',o);bu.setAttribute('aria-expanded',o);document.body.classList.toggle('lock',o);bu.setAttribute('aria-label',o?'Close menu':'Open menu');if(o){mn.querySelector('a').focus()}}
bu.addEventListener('click',function(){mset(bu.getAttribute('aria-expanded')!=='true')});
mn.addEventListener('click',function(e){if(e.target.closest('a'))mset(false)});
addEventListener('keydown',function(e){if(e.key==='Escape'&&mn.classList.contains('open')){mset(false);bu.focus()}});
addEventListener('resize',function(){if(innerWidth>900&&mn.classList.contains('open'))mset(false)});
})();