
const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require('hardhat');
const { ethers } = require("hardhat");;

async function getToken() {

  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken")
  token = await tokenFactory.deploy('a', 'a', 18);
  await token.deployed();
  return token;
}

function decimalToUnDecimalStr(num) {
    return new BigNumber(num).times(10 ** 18).toFixed(0);
}

function stringDiv(a, b) {
    let an = new BigNumber(a);
    an = an.minus(an.mod(b));
    return an.div(b).toFixed(0, 3);
}

function stringMul(a, b) {
    let an = new BigNumber(a);
    an = an.times(b);
    return an.toFixed(0, 3);
}

function stringMinus(a, b) {
    let an = new BigNumber(a);
    an = an.minus(b);
    return an.toFixed(0, 3);
}

function stringAdd(a, b) {
    let an = new BigNumber(a);
    an = an.plus(b);
    return an.toFixed(0, 3);
}


function getLockData(slope, MAXTIME, startTime, endTime) {
    const amount = slope * MAXTIME;
    const bias = slope * (endTime - startTime);
    return {
        slope,
        amount,
        bias,
        startTime,
        endTime,
    };
}

function getLastPointAndSlopeChanges(locks, timestamp) {
    let bias = 0;
    let slope = 0;
    const slopeChanges = {};
    for (const lock of locks) {
        // it is assumed that lock.startTime <= timestamp
        if (lock.endTime > timestamp) {
            bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope
            slope = slope + lock.slope;
            if (slopeChanges[lock.endTime] == undefined) {
                slopeChanges[lock.endTime] = -lock.slope;
            } else {
                slopeChanges[lock.endTime] -= lock.slope;
            }
        }
    }
    return {bias, slope, slopeChanges};
}

async function waitUntilJustBefore(destBlockNumber) {
    let currentBlockNumber = await ethers.provider.getBlockNumber();
    while (currentBlockNumber < destBlockNumber - 1) {
        await ethers.provider.send('evm_mine');
        currentBlockNumber = await ethers.provider.getBlockNumber();
    }
    return currentBlockNumber;
}

async function getStakingStatus(vePUL, nftId) {
    const stakingStatus = await vePUL.stakingStatus(nftId);
    return {
        stakingId: stakingStatus.stakingId.toString(),
        lockAmount: stakingStatus.lockAmount.toString(),
        lastVePUL: stakingStatus.lastVePUL.toString(),
        lastTouchAccRewardPerShare: stakingStatus.lastTouchAccRewardPerShare.toString(),
    };
}

async function getRewardInfo(vePUL) {
    const rewardInfo = await vePUL.rewardInfo();
    return {
        provider: rewardInfo.provider,
        accRewardPerShare: rewardInfo.accRewardPerShare.toString(),
        rewardPerBlock: rewardInfo.rewardPerBlock.toString(),
        lastTouchBlock: rewardInfo.lastTouchBlock.toString(),
        startBlock: rewardInfo.startBlock.toString(),
        endBlock: rewardInfo.endBlock.toString()
    }
}

async function collect(vePUL, PUL, tester) {
    const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
    await vePUL.connect(tester).collect();
    const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
    return stringMinus(PULBalanceAfter, PULBalanceBefore);
}

async function unStake(vePUL, PUL, tester) {
    const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
    await vePUL.connect(tester).unStake();
    const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
    return stringMinus(PULBalanceAfter, PULBalanceBefore);
}

describe("test increase unlock time", function () {

    var signer, tester;
    var PUL;
    var vePUL;

    var timestampStart;
    var rewardPerBlock;

    var q128;

    beforeEach(async function() {
      
        [signer, tester, other, other2] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        PUL = await tokenFactory.deploy('PUL', 'PUL', 18);

        
        const vePULFactory = await ethers.getContractFactory("vePUL");
        rewardPerBlock = '1200000000000000';
        vePUL = await vePULFactory.deploy(PUL.address, {
            provider: signer.address,
            accRewardPerShare: 0,
            rewardPerBlock: rewardPerBlock,
            lastTouchBlock: 0,
            startBlock: 0,
            endBlock: 10000
        });

        await PUL.connect(tester).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(tester.address, '100000000000000000000');
        await PUL.connect(other).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(other.address, '100000000000000000000');
        await PUL.connect(other2).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(other2.address, '100000000000000000000');
        await PUL.connect(signer).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(signer.address, '100000000000000000000');

        const WEEK = Number((await vePUL.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await vePUL.connect(tester).createLock('220000000000000000', timestampStart + WEEK * 35);
        await vePUL.connect(other).createLock('190000000000000000', timestampStart + WEEK * 35);
        await vePUL.connect(tester).createLock('280000000000000000', timestampStart + WEEK * 30);
        await vePUL.connect(other).createLock('310000000000000000', timestampStart + WEEK * 30);
        await vePUL.connect(other2).createLock('350000000000000000', timestampStart + WEEK * 40);
        await vePUL.connect(other2).createLock('360000000000000000', timestampStart + WEEK * 41);
        await vePUL.connect(other2).createLock('370000000000000000', timestampStart + WEEK * 42);

        q128 = BigNumber(2).pow(128).toFixed(0);
    });


    it("stake and collect", async function () {

        const WEEK = Number((await vePUL.WEEK()).toString());
        const MAXTIME = (await vePUL.MAXTIME()).toString();
        let currentBlockNumber = await ethers.provider.getBlockNumber();

        // phase1
        await waitUntilJustBefore(currentBlockNumber + 5);
        const startTime1 = timestampStart + Math.round(WEEK * 5.2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]);

        await vePUL.connect(tester).stake('1');
        const remainTime1_1 = String(timestampStart + WEEK * 35 - startTime1);
        const slope1 = stringDiv('220000000000000000', MAXTIME);
        const stakingStatus1_1 = await getStakingStatus(vePUL, '1');
        const stakePULAmount_1 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_1).to.equal('220000000000000000');
        const lastVePUL1_1 = stringMul(slope1, remainTime1_1);
        expect(lastVePUL1_1).to.equal(stakingStatus1_1.lastVePUL);
        const globalAcc1 = '0';
        const reward1_1 ='0';
        const rewardInfo1 = await getRewardInfo(vePUL);
        expect(rewardInfo1.accRewardPerShare).to.equal(globalAcc1);
        expect(stakingStatus1_1.lastTouchAccRewardPerShare).to.equal(globalAcc1);
        expect(stakingStatus1_1.stakingId).to.equal('1');
        expect((await vePUL.stakedNft(tester.address)).toString()).to.equal('1');
        expect((await vePUL.stakedNftOwners('1')).toLowerCase()).to.equal(tester.address.toLowerCase());
        

        // phase2
        await waitUntilJustBefore(currentBlockNumber + 20);
        const startTime2 = timestampStart + Math.round(WEEK * 12.7);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime2]);

        await vePUL.connect(other).stake('2');
        const remainTime2_2 = String(timestampStart + WEEK * 35 - startTime2);
        const slope2 = stringDiv('190000000000000000', MAXTIME);
        const stakingStatus2_2 = await getStakingStatus(vePUL, '2');
        const stakePULAmount_2 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_2).to.equal('410000000000000000');
        const lastVePUL2_2 = stringMul(slope2, remainTime2_2);
        expect(lastVePUL2_2).to.equal(stakingStatus2_2.lastVePUL);

        const deltaGlobalAcc2 = stringDiv(stringMul(stringMul(rewardPerBlock, '15'), q128), stakePULAmount_1);
        const globalAcc2 = stringAdd(globalAcc1, deltaGlobalAcc2);
        const rewardInfo2 = await getRewardInfo(vePUL);
        expect(rewardInfo2.accRewardPerShare).to.equal(globalAcc2);
        expect(stakingStatus2_2.lastTouchAccRewardPerShare).to.equal(globalAcc2);
        expect(stakingStatus2_2.stakingId).to.equal('2');
        expect((await vePUL.stakedNft(other.address)).toString()).to.equal('2');
        expect((await vePUL.stakedNftOwners('2')).toLowerCase()).to.equal(other.address.toLowerCase());

        // phase3
        await waitUntilJustBefore(currentBlockNumber + 30);
        const startTime3 = timestampStart + Math.round(WEEK * 13.5);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime3]);

        const PULReward3 = await collect(vePUL, PUL, tester);

        const remainTime1_3 = String(timestampStart + WEEK * 35 - startTime3);
        const stakingStatus1_3 = await getStakingStatus(vePUL, '1');
        const stakePULAmount_3 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_3).to.equal('410000000000000000');
        const lastVePUL1_3 = stringMul(slope1, remainTime1_3);
        expect(lastVePUL1_3).to.equal(stakingStatus1_3.lastVePUL);

        const deltaGlobalAcc3 = stringDiv(stringMul(stringMul(rewardPerBlock, '10'), q128), stakePULAmount_2);
        const globalAcc3 = stringAdd(globalAcc2, deltaGlobalAcc3);
        expect(PULReward3).to.equal(stringDiv(stringMul(lastVePUL1_1, globalAcc3), q128));

        const rewardInfo3 = await getRewardInfo(vePUL);
        expect(rewardInfo3.accRewardPerShare).to.equal(globalAcc3);
        expect(stakingStatus1_3.lastTouchAccRewardPerShare).to.equal(globalAcc3);
        expect(stakingStatus1_3.stakingId).to.equal('1');
        expect((await vePUL.stakedNft(tester.address)).toString()).to.equal('1');
        expect((await vePUL.stakedNftOwners('1')).toLowerCase()).to.equal(tester.address.toLowerCase());


        // phase4
        await waitUntilJustBefore(currentBlockNumber + 32);
        const startTime4 = timestampStart + Math.round(WEEK * 15);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime4]);

        await vePUL.connect(other2).stake('7');
        const remainTime7_4 = String(timestampStart + WEEK * 42 - startTime4);
        const slope7 = stringDiv('370000000000000000', MAXTIME);
        const stakingStatus7_4 = await getStakingStatus(vePUL, '7');
        const stakePULAmount_4 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_4).to.equal('780000000000000000');
        const lastVePUL7_4 = stringMul(slope7, remainTime7_4);
        expect(lastVePUL7_4).to.equal(stakingStatus7_4.lastVePUL);

        const deltaGlobalAcc4 = stringDiv(stringMul(stringMul(rewardPerBlock, '2'), q128), stakePULAmount_3);
        const globalAcc4 = stringAdd(globalAcc3, deltaGlobalAcc4);
        const rewardInfo4 = await getRewardInfo(vePUL);
        expect(rewardInfo4.accRewardPerShare).to.equal(globalAcc4);
        expect(stakingStatus7_4.lastTouchAccRewardPerShare).to.equal(globalAcc4);
        expect(stakingStatus7_4.stakingId).to.equal('3');
        expect((await vePUL.stakedNft(other2.address)).toString()).to.equal('7');
        expect((await vePUL.stakedNftOwners('7')).toLowerCase()).to.equal(other2.address.toLowerCase());

        // phase5
        await waitUntilJustBefore(currentBlockNumber + 35);
        const startTime5 = timestampStart + Math.round(WEEK * 15.1);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime5]);

        const actualReward2_5 = await unStake(vePUL, PUL, other);
        const stakePULAmount_5 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_5).to.equal('590000000000000000');
        const deltaGlobalAcc5 = stringDiv(stringMul(stringMul(rewardPerBlock, '3'), q128), stakePULAmount_4);
        const globalAcc5 = stringAdd(globalAcc4, deltaGlobalAcc5);
        const expectReward2_5 = stringDiv(stringMul(stringMinus(globalAcc5, globalAcc2), lastVePUL2_2), q128);
        expect(actualReward2_5).to.equal(expectReward2_5);
        const rewardInfo5 = await getRewardInfo(vePUL);
        expect(rewardInfo5.accRewardPerShare).to.equal(globalAcc5);
        const stakingStatus2_5 = await getStakingStatus(vePUL, '2');
        // after unStake
        expect(stakingStatus2_5.stakingId).to.equal('0'); 
        expect((await vePUL.stakedNft(other.address)).toString()).to.equal('0');
        expect(BigNumber((await vePUL.stakedNftOwners('2')).toLowerCase()).toFixed(0)).to.equal('0');

        // phase6
        await waitUntilJustBefore(currentBlockNumber + 41);
        const startTime6 = timestampStart + Math.round(WEEK * 16.6);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime6]);

        const PULReward6 = await collect(vePUL, PUL, tester);

        const remainTime1_6 = String(timestampStart + WEEK * 35 - startTime6);
        const stakingStatus1_6 = await getStakingStatus(vePUL, '1');
        const stakePULAmount_6 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_6).to.equal('590000000000000000');
        const lastVePUL1_6 = stringMul(slope1, remainTime1_6);
        expect(lastVePUL1_6).to.equal(stakingStatus1_6.lastVePUL);

        const deltaGlobalAcc6 = stringDiv(stringMul(stringMul(rewardPerBlock, '6'), q128), stakePULAmount_5);
        const globalAcc6 = stringAdd(globalAcc5, deltaGlobalAcc6);
        expect(PULReward6).to.equal(stringDiv(stringMul(lastVePUL1_3, stringMinus(globalAcc6, globalAcc3)), q128));

        const rewardInfo6 = await getRewardInfo(vePUL);
        expect(rewardInfo6.accRewardPerShare).to.equal(globalAcc6);
        expect(stakingStatus1_6.lastTouchAccRewardPerShare).to.equal(globalAcc6);
        expect(stakingStatus1_6.stakingId).to.equal('1');
        expect((await vePUL.stakedNft(tester.address)).toString()).to.equal('1');
        expect((await vePUL.stakedNftOwners('1')).toLowerCase()).to.equal(tester.address.toLowerCase());

        // phase7
        await waitUntilJustBefore(currentBlockNumber + 42);
        const startTime7 = timestampStart + Math.round(WEEK * 16.7);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime7]);

        const actualReward1_7 = await unStake(vePUL, PUL, tester);
        const stakePULAmount_7 = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount_7).to.equal('370000000000000000');
        const deltaGlobalAcc7 = stringDiv(stringMul(stringMul(rewardPerBlock, '1'), q128), stakePULAmount_6);
        const globalAcc7 = stringAdd(globalAcc6, deltaGlobalAcc7);
        const expectReward1_7 = stringDiv(stringMul(stringMinus(globalAcc7, globalAcc6), lastVePUL1_6), q128);
        expect(actualReward1_7).to.equal(expectReward1_7);
        const rewardInfo7 = await getRewardInfo(vePUL);
        expect(rewardInfo7.accRewardPerShare).to.equal(globalAcc7);
        const stakingStatus1_7 = await getStakingStatus(vePUL, '1');
        // after unStake
        expect(stakingStatus1_7.stakingId).to.equal('0'); 
        expect((await vePUL.stakedNft(tester.address)).toString()).to.equal('0');
        expect(BigNumber((await vePUL.stakedNftOwners('1')).toLowerCase()).toFixed(0)).to.equal('0');

    });


});