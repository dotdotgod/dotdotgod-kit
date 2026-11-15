// Conservative structural identity, not a substitute for the kernel loader or a sandbox.
export function nativeBinary(bytes: Buffer): boolean {
 try {
  const magic=bytes.subarray(0,4).toString("hex");
  if(process.platform==="linux" && magic==="7f454c46") {
   const wide=bytes[4]===2;
   if(![1,2].includes(bytes[4]!) || bytes[5]!==1 || bytes[6]!==1 || bytes.length<(wide?64:52))return false;
   const machine=process.arch==="x64"?62:process.arch==="arm64"?183:undefined;
   if(!machine || bytes.readUInt16LE(18)!==machine || ![2,3].includes(bytes.readUInt16LE(16)) || bytes.readUInt32LE(20)!==1)return false;
   const offset=wide?Number(bytes.readBigUInt64LE(32)):bytes.readUInt32LE(28);
   const size=bytes.readUInt16LE(wide?54:42), count=bytes.readUInt16LE(wide?56:44);
   if(bytes.readUInt16LE(wide?52:40)!==(wide?64:52) || size!==(wide?56:32) || !count || offset<(wide?64:52) || !Number.isSafeInteger(offset) || offset+count*size>bytes.length)return false;
   let load=false;
   for(let i=0;i<count;i++) {
    const at=offset+i*size;
    const fileOffset=wide?Number(bytes.readBigUInt64LE(at+8)):bytes.readUInt32LE(at+4);
    const fileSize=wide?Number(bytes.readBigUInt64LE(at+32)):bytes.readUInt32LE(at+16);
    if(!Number.isSafeInteger(fileOffset) || !Number.isSafeInteger(fileSize) || fileOffset+fileSize>bytes.length)return false;
    if(bytes.readUInt32LE(at)===1 && fileSize>0)load=true;
   }
   return load;
  }
  if(process.platform!=="darwin")return false;
  if(magic==="cafebabe" && bytes.length>=8) {
   const count=bytes.readUInt32BE(4);
   if(!count || count>(bytes.length-8)/20)return false;
   let compatible=false;
   for(let i=0;i<count;i++) {
    const at=8+i*20, offset=bytes.readUInt32BE(at+8), size=bytes.readUInt32BE(at+12);
    if(offset<8+count*20 || size<32 || offset+size>bytes.length)return false;
    if(nativeBinary(bytes.subarray(offset,offset+size)))compatible=true;
   }
   return compatible;
  }
  // Only modern little-endian 64-bit executable slices are supported.
  if(magic!=="cffaedfe" || bytes.length<32 || bytes.readUInt32LE(12)!==2)return false;
  const cpu=process.arch==="arm64"?0x100000c:process.arch==="x64"?0x1000007:undefined;
  if(!cpu || bytes.readUInt32LE(4)!==cpu)return false;
  const count=bytes.readUInt32LE(16), total=bytes.readUInt32LE(20);
  if(!count || total>bytes.length-32 || count>total/8)return false;
  let at=32, segment=false, entry=false;
  for(let i=0;i<count;i++) {
   if(at+8>32+total)return false;
   const command=bytes.readUInt32LE(at), size=bytes.readUInt32LE(at+4);
   if(size<8 || size%8!==0 || at+size>32+total)return false;
   if(command===0x19) {
    if(size<72 || size!==72+bytes.readUInt32LE(at+64)*80)return false;
    const offset=Number(bytes.readBigUInt64LE(at+40)), length=Number(bytes.readBigUInt64LE(at+48));
    if(!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset+length>bytes.length)return false;
    if(length>0)segment=true;
   }
   if(command===0x80000028 && size===24)entry=true;
   if(command===5 && size>=16)entry=true;
   at+=size;
  }
  return at===32+total && segment && entry;
 } catch { return false; }
}
