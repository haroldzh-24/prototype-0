/** Stable binary min heap keeps bounded search from sorting a growing frontier. */
export class PriorityQueue<T> {
  private values:T[]=[];
  constructor(private compare:(a:T,b:T)=>number){}
  get size(){return this.values.length;}
  push(value:T){
    this.values.push(value);let i=this.values.length-1;
    while(i>0){const p=Math.floor((i-1)/2);if(this.compare(this.values[p],value)<=0)break;this.values[i]=this.values[p];i=p;}this.values[i]=value;
  }
  pop():T|undefined{
    const first=this.values[0],last=this.values.pop();if(!this.values.length||last===undefined)return first;
    let i=0;
    while(i*2+1<this.values.length){let child=i*2+1;if(child+1<this.values.length&&this.compare(this.values[child+1],this.values[child])<0)child++;if(this.compare(last,this.values[child])<=0)break;this.values[i]=this.values[child];i=child;}
    this.values[i]=last;return first;
  }
}
