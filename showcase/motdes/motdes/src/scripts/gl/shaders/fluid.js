/**
 * 流体解算的六个计算着色器。
 *
 * 逐字从 .ref/app.js 里程序化提取，未经任何手工改写 —— 这类 GLSL 抄错一个
 * 符号就会变成完全不同的动力学，不是能"照着写"的东西。
 * 对应原站的 comShaderCurl / Divergence / Velocity / GradientSubtract /
 * Pressure / Advect。
 *
 * 数据布局：RGBA 一张浮点图，xy = 速度，z = 压力，w = 散度。
 */

export const computeVert = `#define GLSLIFY 1
varying vec2 vUv;void main(){gl_Position=vec4(position,1.0);vUv=uv;}`;

export const passThroughFrag = `#define GLSLIFY 1
uniform sampler2D tex;varying vec2 vUv;void main(){gl_FragColor=texture2D(tex,vUv);}`;

export const curlFrag = `#define GLSLIFY 1
uniform sampler2D dataTex;uniform vec2 dataSize;uniform float curl;vec2 sampleData(sampler2D tex,vec2 uv,vec2 res){vec2 offset=vec2(0.0,0.0);float w=1.0;return w*texture2D(tex,uv+offset/res).xy;}void main(){vec2 uv=gl_FragCoord.xy/dataSize;vec2 offsetX=vec2(1.0,0.0);vec2 offsetY=vec2(0.0,1.0);float l=sampleData(dataTex,(gl_FragCoord.xy-offsetX)/dataSize,dataSize).y;float r=sampleData(dataTex,(gl_FragCoord.xy+offsetX)/dataSize,dataSize).y;float t=sampleData(dataTex,(gl_FragCoord.xy-offsetY)/dataSize,dataSize).x;float b=sampleData(dataTex,(gl_FragCoord.xy+offsetY)/dataSize,dataSize).x;float c=(r-l-b+t);gl_FragColor=vec4(curl*c,0.0,0.0,1.0);}`;

export const divergenceFrag = `#define GLSLIFY 1
uniform vec2 dataSize;uniform sampler2D dataTex;vec2 sampleData(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);float w=1.0;return w*texture2D(tex,uv+offset/resolution).xy;}void main(){vec4 data=texture2D(dataTex,gl_FragCoord.xy/dataSize);vec2 offsetX=vec2(1.0,0.0);vec2 offsetY=vec2(0.0,1.0);vec2 l=sampleData(dataTex,(gl_FragCoord.xy-offsetX)/dataSize,dataSize);vec2 r=sampleData(dataTex,(gl_FragCoord.xy+offsetX)/dataSize,dataSize);vec2 t=sampleData(dataTex,(gl_FragCoord.xy-offsetY)/dataSize,dataSize);vec2 b=sampleData(dataTex,(gl_FragCoord.xy+offsetY)/dataSize,dataSize);float divergence=((r.x-l.x)+(b.y-t.y))*0.5;gl_FragColor=vec4(data.xyz,divergence);}`;

export const velocityFrag = `#define GLSLIFY 1
uniform float uTime;uniform vec2 dataSize;uniform sampler2D dataTex;uniform sampler2D curlTex;uniform vec2 pointerPos;uniform vec2 pointerVec;uniform float pointerSize;uniform float screenAspect;uniform vec2 uElmListPos[5];uniform vec2 uElmListVel[5];uniform vec2 uElmListSize[5];float random(vec2 p){return fract(sin(dot(p.xy,vec2(12.9898,78.233)))*43758.5453);}vec2 smapleVelocity(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);float w=1.0;return w*texture2D(tex,uv+offset/resolution).xy;}float samplePressure(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);float w=1.0;if(uv.x<0.0){offset.x=1.0;w=-1.0;}else if(uv.x>1.0){offset.x=-1.0;w=-1.0;}if(uv.y<0.0){offset.y=1.0;w=-1.0;}else if(uv.y>1.0){offset.y=-1.0;w=-1.0;}return w*texture2D(tex,uv+offset/resolution).z;}void main(){vec2 uv=gl_FragCoord.xy/dataSize;vec2 offsetX=vec2(1.0,0.0);vec2 offsetY=vec2(0.0,1.0);float l=smapleVelocity(curlTex,(gl_FragCoord.xy-offsetX)/dataSize,dataSize).x;float r=smapleVelocity(curlTex,(gl_FragCoord.xy+offsetX)/dataSize,dataSize).x;float t=smapleVelocity(curlTex,(gl_FragCoord.xy-offsetY)/dataSize,dataSize).x;float b=smapleVelocity(curlTex,(gl_FragCoord.xy+offsetY)/dataSize,dataSize).x;float c=texture2D(curlTex,uv).x;vec2 force=0.5*vec2(abs(b)-abs(t),abs(r)-abs(l));force/=length(force)+0.0001;force*=1.0*c;force.y*=-1.0;vec4 data=texture2D(dataTex,uv);vec2 pointerUv=uv;pointerUv-=pointerPos;if(screenAspect<1.0){pointerUv.x*=screenAspect;}else{pointerUv.y/=screenAspect;}float pv=length(pointerVec);pv=smoothstep(0.01,1.0,pv);float pointerW=smoothstep(0.01+0.1*min(0.5,pv),0.0,length(pointerUv));vec2 vel=vec2(0.0,0.0);vec2 velPower=pointerVec*30.0;if(screenAspect<1.0){velPower.x/=screenAspect;}else{velPower.y*=screenAspect;}velPower=min(abs(velPower),vec2(2.0))*sign(velPower);vel+=pointerW*velPower;gl_FragColor=vec4(data.xy+vel+force,data.zw);}`;

export const gradientSubtractFrag = `precision mediump float;precision mediump sampler2D;
#define GLSLIFY 1
uniform vec2 dataSize;uniform sampler2D dataTex;float sampleData(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);return texture2D(tex,uv+offset/resolution).z;}void main(){vec2 uv=gl_FragCoord.xy/dataSize;float l=sampleData(dataTex,(gl_FragCoord.xy-vec2(1.0,0.0))/dataSize,dataSize);float r=sampleData(dataTex,(gl_FragCoord.xy+vec2(1.0,0.0))/dataSize,dataSize);float t=sampleData(dataTex,(gl_FragCoord.xy-vec2(0.0,1.0))/dataSize,dataSize);float b=sampleData(dataTex,(gl_FragCoord.xy+vec2(0.0,1.0))/dataSize,dataSize);vec4 data=texture2D(dataTex,uv);data.xy-=vec2(r-l,b-t);gl_FragColor=data;}`;

export const pressureFrag = `#define GLSLIFY 1
uniform float alpha;uniform float beta;uniform vec2 dataSize;uniform sampler2D dataTex;float sampleData(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);return texture2D(tex,uv+offset/resolution).z;}void main(){vec4 data=texture2D(dataTex,gl_FragCoord.xy/dataSize);float l=sampleData(dataTex,(gl_FragCoord.xy-vec2(1.0,0.0))/dataSize,dataSize);float r=sampleData(dataTex,(gl_FragCoord.xy+vec2(1.0,0.0))/dataSize,dataSize);float t=sampleData(dataTex,(gl_FragCoord.xy-vec2(0.0,1.0))/dataSize,dataSize);float b=sampleData(dataTex,(gl_FragCoord.xy+vec2(0.0,1.0))/dataSize,dataSize);float divergence=data.w;float pressure=((l+r+t+b)-divergence)*0.25;gl_FragColor=vec4(data.xy,pressure,divergence);}`;

export const advectFrag = `#define GLSLIFY 1
uniform vec2 dataSize;uniform sampler2D dataTex;uniform float velocityAttenuation;uniform float pressureAttenuation;vec2 sampleVelocity(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);float w=1.0;return w*texture2D(tex,uv+offset/resolution).xy;}float samplePressure(sampler2D tex,vec2 uv,vec2 resolution){vec2 offset=vec2(0.0,0.0);if(uv.x<0.0){offset.x=1.0;}else if(uv.x>1.0){offset.x=-1.0;}if(uv.y<0.0){offset.y=1.0;}else if(uv.y>1.0){offset.y=-1.0;}return texture2D(tex,uv+offset/resolution).z;}void main(){vec2 uv=gl_FragCoord.xy/dataSize;vec2 p=gl_FragCoord.xy-sampleVelocity(dataTex,uv,dataSize);gl_FragColor=vec4(sampleVelocity(dataTex,p/dataSize,dataSize)*velocityAttenuation,samplePressure(dataTex,uv,dataSize)*pressureAttenuation,0.0);}`;

