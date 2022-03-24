const { ethers } = require("hardhat");
const deployed = require('./deployed.js');
const vePULLib = require("./libraries/vePUL.js");
const stringOpt = require('./libraries/stringOperations.js');
const {getWeb3} = require('./libraries/getWeb3');
const {getToken} = require('./libraries/getToken');
const BigNumber = require("bignumber.js");

/*

example: 

HARDHAT_NETWORK='ethereum' node scripts/nftStatistics.js output/data.txt

*/

const v = process.argv
const net = process.env.HARDHAT_NETWORK

const para = {
  vePULAddress : deployed[net]['vePUL'],
  PULAddress: deployed[net]['PUL'],
  path: v[2]
}

async function main() {
    const currentDate = new Date();
    const currentTimestamp = currentDate.getTime() / 1000;
    const MAX_TIME = String((4 * 365 + 1) * 24 * 3600);
    const PUL = getToken(para.PULAddress);
    const decimals = Number(await PUL.methods.decimals().call());
    console.log('PUL decimals: ', decimals);
    console.log('vePUL address: ', para.vePULAddress);
    const vePULContract = vePULLib.getVePUL(para.vePULAddress);
    const nftNum = Number((await vePULContract.methods.nftNum().call()).toString());
    console.log('nftNum: ', nftNum);
    const nftIds = Array(nftNum).fill().map((_,i)=>i+1);
    console.log('nftids: ', nftIds);
    const web3 = getWeb3();
    const nftLocked = await vePULLib.getNftLocked(web3, vePULContract, nftIds);
    const stakedNftOwners = await vePULLib.getStakedNftOwners(web3, vePULContract, nftIds);
    const nftOwners = await vePULLib.getNftOwners(web3, vePULContract, nftIds);
    const stakingStatus = await vePULLib.getStakingStatus(web3, vePULContract, nftIds);
    const nftList = [];
    for (let i = 0; i < nftIds.length; i ++) {
       console.log('i: ', i, ' ', nftOwners[i]);
        if (BigNumber(nftOwners[i]).toFixed(0) === '0') {
            // owner address is 0x0
            continue;
        }
        const nftId = nftIds[i];
        const endTime = nftLocked[i].end.toString();
        const remainTime = String(Math.max(Number(endTime) - currentTimestamp, 0));

        const slope = stringOpt.stringDiv(nftLocked[i].amount.toString(), MAX_TIME);
        const vePULNoDecimal = stringOpt.stringMul(slope, remainTime);
        const vePUL = BigNumber(vePULNoDecimal).div(10 ** decimals).toFixed(15);
        const amount = BigNumber(nftLocked[i].amount.toString()).div(10 ** decimals).toFixed(15);

        const staking = stakingStatus[i].stakingId.toString() === '0';

        const owner = staking ? nftOwners[i] : stakedNftOwners[i];

        const nft = {
            nftId, endTime, remainTime, vePUL, amount, owner, staking: staking? 'staking': 'unStaking'
        }
        console.log('nft: ', nft);

        nftList.push(nft);

    }


    let data = '';
    for (const nft of nftList) {
      data = data + String(nft.nftId) + ' ' + String(nft.vePUL) + ' ' + String(nft.amount) + ' ' + String(nft.endTime) + ' ' + String(nft.owner) + ' ' + String(nft.staking) + '\n';
    }
    
    const fs = require('fs');
    await fs.writeFileSync(para.path, data);
}

main().then(() => process.exit(0))
.catch((error) => {
  console.error(error);
  process.exit(1);
})