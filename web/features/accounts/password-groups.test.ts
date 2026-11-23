import { groupPassword } from '@/features/accounts/password-groups'

describe('groupPassword', () => {
  it('splits a generated password into three fours', () => {
    expect(groupPassword('mapekrytuvha')).toEqual(['mape', 'kryt', 'uvha'])
  })

  it('leaves a value of another length whole', () => {
    expect(groupPassword('abcdefghjk')).toEqual(['abcdefghjk'])
  })

  it('leaves a value already holding spaces whole', () => {
    expect(groupPassword('mape kryt uv')).toEqual(['mape kryt uv'])
  })
})
